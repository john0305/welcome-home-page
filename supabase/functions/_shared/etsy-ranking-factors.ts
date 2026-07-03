/**
 * ETSY RANKING FACTORS — single source of truth.
 *
 * Every checkable factor RadarIQ grades against lives here. Grading, Echo,
 * Store Health, the nightly scanner, and the apply layer all read from this
 * registry so they speak the same language. When Etsy's ranking algorithm
 * shifts, you change this file and the change propagates to every surface.
 *
 * Each factor declares:
 *   - Identifying metadata (key, label, dimension, weight)
 *   - A resolution mode: 'auto' (we can apply), 'guided' (we hand the seller
 *     copy-paste content), or 'inform' (we explain — they decide)
 *   - check(): runs against a listing or shop context and returns whether the
 *     factor passes, plus structured evidence for the UI
 *   - generateFix(): produces a proposed fix (only for auto + guided modes)
 *   - applyFix(): pushes the fix to Etsy (only for auto mode)
 *   - guidedTemplate(): emits copyable content + deep link (only for guided)
 *
 * Both edge functions and the client read METADATA from here; only edge
 * functions execute the async behaviors.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type FactorMode = "auto" | "guided" | "inform";
export type FactorDimension =
  | "content"
  | "media"
  | "tags"
  | "shipping"
  | "policies"
  | "shop";
export type FactorSeverity = "low" | "medium" | "high" | "critical";
export type FactorScope = "listing" | "shop";

export interface ListingCtx {
  id: string;
  user_id: string;
  etsy_listing_id: number | string;
  etsy_shop_id: string;
  title: string | null;
  description: string | null;
  tags: string[];
  materials: string[];
  image_urls: string[];
  has_video?: boolean | null;
  price?: number | null;
  shipping_price?: number | null;
  current_grade?: number | null;
  category?: string | null;
}

export interface ShopCtx {
  user_id: string;
  etsy_shop_id: string;
  shop_name?: string | null;
  return_policy?: string | null;
  shipping_policy?: string | null;
  review_count?: number | null;
  review_avg?: number | null;
  message_response_rate?: number | null;
  has_shop_icon?: boolean | null;
  has_banner?: boolean | null;
  category?: string | null;
}

export interface CheckResult {
  passes: boolean;
  severity: FactorSeverity;
  current_value: unknown;
  rationale: string;
  evidence?: Record<string, unknown>;
}

export interface GeneratedFix {
  proposed_value: unknown;
  rationale: string;
  guided_payload?: {
    instructions: string;
    copyable_content: string;
    etsy_deep_link: string;
  };
}

export interface ApplyResult {
  ok: boolean;
  applied_value?: unknown;
  etsy_response?: unknown;
  failure_reason?: string;
  /** When true, caller should demote the action to guided mode instead of failing. */
  demote_to_guided?: boolean;
}

export interface FactorDef {
  key: string;
  label: string;
  dimension: FactorDimension;
  scope: FactorScope;
  mode: FactorMode;
  weight: number;
  /** Safe to auto-apply without explicit approval (subject to user opt-in). */
  safe_auto_apply: boolean;
  /**
   * True for factors whose actions are created AND resolved by a dedicated
   * pipeline step (their check() is a pass-through). The nightly scan's
   * re-check step must skip these — a pass-through check would otherwise
   * supersede them every night.
   */
  pipeline_computed?: boolean;
  description: string;
  check: (ctx: ListingCtx | ShopCtx) => Promise<CheckResult> | CheckResult;
  generateFix?: (
    ctx: ListingCtx | ShopCtx,
    ai: AiGateway,
  ) => Promise<GeneratedFix | null>;
  applyFix?: (
    ctx: ListingCtx | ShopCtx,
    proposed: unknown,
    api: EtsyApi,
  ) => Promise<ApplyResult>;
}

// ─── Tiny AI + Etsy adapter contracts (implemented in edge functions) ───────

export interface AiGateway {
  json: <T>(prompt: string, system?: string) => Promise<T>;
}

export interface EtsyApi {
  /** PATCH a listing field. Returns parsed body or throws with .status. */
  patchListing: (
    listingId: string | number,
    shopId: string,
    body: Record<string, unknown>,
  ) => Promise<{ ok: boolean; status: number; body: unknown }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const isListing = (c: ListingCtx | ShopCtx): c is ListingCtx =>
  (c as ListingCtx).etsy_listing_id !== undefined;

const buildListingDeepLink = (c: ListingCtx) =>
  `https://www.etsy.com/your/shops/me/tools/listings/${c.etsy_listing_id}`;

const buildShopPoliciesLink = () =>
  `https://www.etsy.com/your/shops/me/settings/policies`;

// ─── Factor definitions ─────────────────────────────────────────────────────
// Phase 1 ships a representative slice covering all three modes. Extend by
// adding entries — no other file needs to change.

const TAGS_COMPLETE: FactorDef = {
  key: "tags_complete",
  label: "All 13 tag slots used",
  dimension: "tags",
  scope: "listing",
  mode: "auto",
  weight: 12,
  safe_auto_apply: true,
  description:
    "Etsy gives each listing 13 tag slots — every empty one is a missed match.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    const count = (ctx.tags || []).length;
    return {
      passes: count >= 13,
      severity: count <= 5 ? "high" : count <= 9 ? "medium" : "low",
      current_value: ctx.tags,
      rationale: `Using ${count} of 13 tag slots.`,
      evidence: { tag_count: count, missing: 13 - count },
    };
  },
  generateFix: async (ctx, ai) => {
    if (!isListing(ctx)) return null;
    const missing = 13 - (ctx.tags || []).length;
    if (missing <= 0) return null;
    const prompt = `You are an Etsy SEO expert. Generate ${missing} additional tag(s) for this listing. Each tag MUST be 20 characters or less, lowercase, no commas, no special characters, and must NOT duplicate any existing tag. Return strict JSON: {"tags":["...","..."]}.

Listing title: ${ctx.title}
Existing tags: ${(ctx.tags || []).join(", ")}
Materials: ${(ctx.materials || []).join(", ")}
Description excerpt: ${(ctx.description || "").slice(0, 600)}`;
    const out = await ai.json<{ tags: string[] }>(prompt);
    const fresh = (out.tags || [])
      .map((t) => String(t).toLowerCase().trim().slice(0, 20))
      .filter((t) => t && !(ctx.tags || []).includes(t))
      .slice(0, missing);
    const proposed = [...(ctx.tags || []), ...fresh].slice(0, 13);
    return {
      proposed_value: proposed,
      rationale: `Added ${fresh.length} tag(s) chosen for buyer search relevance.`,
    };
  },
  applyFix: async (ctx, proposed, api) => {
    if (!isListing(ctx)) return { ok: false, failure_reason: "wrong_scope" };
    const tags = Array.isArray(proposed) ? (proposed as string[]).slice(0, 13) : null;
    if (!tags) return { ok: false, failure_reason: "invalid_proposed" };
    try {
      const r = await api.patchListing(ctx.etsy_listing_id, ctx.etsy_shop_id, { tags });
      if (!r.ok) {
        return {
          ok: false,
          failure_reason: `Etsy returned ${r.status}`,
          etsy_response: r.body,
          demote_to_guided: r.status >= 400 && r.status < 500,
        };
      }
      return { ok: true, applied_value: tags, etsy_response: r.body };
    } catch (e) {
      return { ok: false, failure_reason: String(e), demote_to_guided: true };
    }
  },
};

const MATERIALS_PRESENT: FactorDef = {
  key: "materials_present",
  label: "Materials field filled",
  dimension: "content",
  scope: "listing",
  mode: "auto",
  weight: 6,
  safe_auto_apply: true,
  description:
    "Materials are a secondary search signal and a trust signal for buyers reading the listing.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    const count = (ctx.materials || []).length;
    return {
      passes: count >= 3,
      severity: count === 0 ? "medium" : "low",
      current_value: ctx.materials,
      rationale: count === 0
        ? "No materials listed."
        : `Only ${count} material${count === 1 ? "" : "s"} listed.`,
      evidence: { material_count: count },
    };
  },
  generateFix: async (ctx, ai) => {
    if (!isListing(ctx)) return null;
    const prompt = `Infer 3-6 likely materials for this Etsy listing. Each ≤ 45 characters. Return JSON: {"materials":["..."]}.

Title: ${ctx.title}
Existing materials: ${(ctx.materials || []).join(", ") || "(none)"}
Description: ${(ctx.description || "").slice(0, 800)}`;
    const out = await ai.json<{ materials: string[] }>(prompt);
    const merged = Array.from(new Set([
      ...(ctx.materials || []),
      ...(out.materials || []).map((m) => String(m).slice(0, 45)),
    ])).slice(0, 13);
    return {
      proposed_value: merged,
      rationale: `Filled in ${merged.length - (ctx.materials || []).length} missing material(s).`,
    };
  },
  applyFix: async (ctx, proposed, api) => {
    if (!isListing(ctx)) return { ok: false, failure_reason: "wrong_scope" };
    const materials = Array.isArray(proposed) ? (proposed as string[]).slice(0, 13) : null;
    if (!materials) return { ok: false, failure_reason: "invalid_proposed" };
    try {
      const r = await api.patchListing(ctx.etsy_listing_id, ctx.etsy_shop_id, { materials });
      if (!r.ok) {
        return {
          ok: false,
          failure_reason: `Etsy returned ${r.status}`,
          etsy_response: r.body,
          demote_to_guided: r.status >= 400 && r.status < 500,
        };
      }
      return { ok: true, applied_value: materials, etsy_response: r.body };
    } catch (e) {
      return { ok: false, failure_reason: String(e), demote_to_guided: true };
    }
  },
};

const TITLE_LENGTH: FactorDef = {
  key: "title_length",
  label: "Title uses available characters",
  dimension: "content",
  scope: "listing",
  mode: "auto",
  weight: 14,
  safe_auto_apply: false, // titles change buyer perception — require explicit approval
  description:
    "Etsy titles can be up to 140 characters. Short titles miss long-tail keyword matches.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    const len = (ctx.title || "").length;
    return {
      passes: len >= 80,
      severity: len < 40 ? "high" : len < 60 ? "medium" : "low",
      current_value: ctx.title,
      rationale: `Title is ${len} characters; target 100-140 for keyword reach.`,
      evidence: { length: len, target: 120 },
    };
  },
  generateFix: async (ctx, ai) => {
    if (!isListing(ctx)) return null;
    const prompt = `Rewrite this Etsy listing title to 100-140 characters, keyword-front-loaded, no ALL CAPS, no emoji. Preserve the product identity. Return JSON: {"title":"..."}.

Current title: ${ctx.title}
Tags: ${(ctx.tags || []).join(", ")}
Description excerpt: ${(ctx.description || "").slice(0, 500)}`;
    const out = await ai.json<{ title: string }>(prompt);
    const title = String(out.title || "").slice(0, 140).trim();
    if (!title || title === ctx.title) return null;
    return {
      proposed_value: title,
      rationale: `Expanded title to ${title.length} characters with stronger keyword coverage.`,
    };
  },
  applyFix: async (ctx, proposed, api) => {
    if (!isListing(ctx)) return { ok: false, failure_reason: "wrong_scope" };
    const title = typeof proposed === "string" ? proposed.slice(0, 140) : null;
    if (!title) return { ok: false, failure_reason: "invalid_proposed" };
    try {
      const r = await api.patchListing(ctx.etsy_listing_id, ctx.etsy_shop_id, { title });
      if (!r.ok) {
        return {
          ok: false,
          failure_reason: `Etsy returned ${r.status}`,
          etsy_response: r.body,
          demote_to_guided: r.status >= 400 && r.status < 500,
        };
      }
      return { ok: true, applied_value: title, etsy_response: r.body };
    } catch (e) {
      return { ok: false, failure_reason: String(e), demote_to_guided: true };
    }
  },
};

const RETURN_POLICY_PRESENT: FactorDef = {
  key: "return_policy_present",
  label: "Shop has a return policy",
  dimension: "policies",
  scope: "shop",
  mode: "guided",
  weight: 10,
  safe_auto_apply: false,
  description:
    "Buyers filter out shops with no return policy. Etsy can't update the policy via API — we hand you ready-to-paste text.",
  check: (ctx) => {
    if (isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    const present = !!(ctx.return_policy && ctx.return_policy.trim().length > 30);
    return {
      passes: present,
      severity: present ? "low" : "high",
      current_value: ctx.return_policy ?? null,
      rationale: present
        ? "Return policy in place."
        : "No return policy detected on your shop.",
    };
  },
  generateFix: async (ctx, ai) => {
    if (isListing(ctx)) return null;
    const cat = ctx.category || "handmade goods";
    const FALLBACK_POLICY =
      `Returns & Exchanges\n\nWe want you to love what you ordered. If something isn't right, contact us within 14 days of delivery and we'll make it right.\n\n• Items must be returned unused, in original condition, within 30 days of delivery.\n• Buyer pays return shipping unless the item arrived damaged or wasn't as described.\n• Refunds are issued to your original payment method within 3-5 business days of receiving the return.\n• Personalized, custom, or made-to-order items are final sale unless they arrive damaged.\n\nQuestions? Message us through Etsy — we typically reply within 24 hours.`;
    let policy = FALLBACK_POLICY;
    try {
      const prompt = `Draft a friendly, plain-English return policy for an Etsy shop selling ${cat}. 80-150 words. Cover: window for returns, condition required, who pays return shipping, refund timing, exceptions for personalized items. Return JSON: {"policy":"..."}.`;
      const out = await ai.json<{ policy: string }>(prompt);
      const drafted = String(out?.policy || "").trim();
      if (drafted.length >= 60) policy = drafted;
    } catch (e) {
      console.error("return_policy generateFix AI failed, using fallback", e);
    }
    return {
      proposed_value: policy,
      rationale: "Drafted from your shop category. Tweak before pasting if you have specific rules.",
      guided_payload: {
        instructions:
          "Etsy's API can't update shop policies. Copy this text and paste it into Etsy → Shop Manager → Settings → Policies → Returns.",
        copyable_content: policy,
        etsy_deep_link: buildShopPoliciesLink(),
      },
    };
  },
  // No applyFix — guided only.
};

const REVIEW_HEALTH: FactorDef = {
  key: "review_health",
  label: "Review rating health",
  dimension: "shop",
  scope: "shop",
  mode: "inform",
  weight: 8,
  safe_auto_apply: false,
  description:
    "Etsy weighs review averages and recency heavily in search. We can't reply for you, but we can flag drops early.",
  check: (ctx) => {
    if (isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    const avg = ctx.review_avg ?? null;
    const count = ctx.review_count ?? 0;
    if (avg == null || count < 5) {
      return {
        passes: true,
        severity: "low",
        current_value: { avg, count },
        rationale: "Not enough reviews yet to flag.",
      };
    }
    const passes = avg >= 4.7;
    return {
      passes,
      severity: avg < 4.3 ? "high" : avg < 4.6 ? "medium" : "low",
      current_value: { avg, count },
      rationale: passes
        ? `Strong review average (${avg.toFixed(2)}) across ${count} reviews.`
        : `Review average ${avg.toFixed(2)} is below the 4.7+ threshold Etsy weights for search.`,
      evidence: { avg, count, target: 4.7 },
    };
  },
  // inform-only: no fix generator, no applier.
};

// ─── Market intelligence factors (generated by onboarding-pipeline) ─────────
// These mirrors apply the same Etsy PATCH logic as their base factors
// but are sourced from competitor gap analysis rather than grading.

const MARKET_TAG_GAP: FactorDef = {
  key: "market_tag_gap",
  label: "Missing competitor tags",
  dimension: "tags",
  scope: "listing",
  mode: "guided",
  weight: 18,
  safe_auto_apply: false,
  description:
    "Your top competitors use tags you don't. Adding them closes the search gap.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    return {
      passes: true, // pass-through — insight is pre-computed by the pipeline
      severity: "high",
      current_value: ctx.tags,
      rationale: "Market-detected tag gap.",
    };
  },
  applyFix: async (ctx, proposed, api) => {
    if (!isListing(ctx)) return { ok: false, failure_reason: "wrong_scope" };
    const tags = Array.isArray(proposed) ? (proposed as string[]).slice(0, 13) : null;
    if (!tags) return { ok: false, failure_reason: "invalid_proposed" };
    try {
      const r = await api.patchListing(ctx.etsy_listing_id, ctx.etsy_shop_id, { tags });
      if (!r.ok) {
        return {
          ok: false,
          failure_reason: `Etsy returned ${r.status}`,
          etsy_response: r.body,
          demote_to_guided: r.status >= 400 && r.status < 500,
        };
      }
      return { ok: true, applied_value: tags, etsy_response: r.body };
    } catch (e) {
      return { ok: false, failure_reason: String(e), demote_to_guided: true };
    }
  },
};

const MARKET_TITLE_LENGTH: FactorDef = {
  key: "market_title_length",
  label: "Title shorter than niche average",
  dimension: "content",
  scope: "listing",
  mode: "guided",
  weight: 16,
  safe_auto_apply: false,
  description:
    "Your title is shorter than the niche average. Longer, keyword-rich titles rank better in this market.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    return {
      passes: true, // pass-through — checked by pipeline
      severity: "high",
      current_value: ctx.title,
      rationale: "Market-detected title gap.",
    };
  },
  // No generateFix — the proposed_value is set by market-title-suggest edge function
  applyFix: async (ctx, proposed, api) => {
    if (!isListing(ctx)) return { ok: false, failure_reason: "wrong_scope" };
    const title = typeof proposed === "string" ? proposed.slice(0, 140) : null;
    if (!title) return { ok: false, failure_reason: "invalid_proposed" };
    try {
      const r = await api.patchListing(ctx.etsy_listing_id, ctx.etsy_shop_id, { title });
      if (!r.ok) {
        return {
          ok: false,
          failure_reason: `Etsy returned ${r.status}`,
          etsy_response: r.body,
          demote_to_guided: r.status >= 400 && r.status < 500,
        };
      }
      return { ok: true, applied_value: title, etsy_response: r.body };
    } catch (e) {
      return { ok: false, failure_reason: String(e), demote_to_guided: true };
    }
  },
};

// ─── Own-data trend factors (Section 4, compliance-first) ────────────────────
// Computed by nightly-action-scan from the seller's OWN listing_snapshots
// history — no competitor or marketplace scanning (see
// documents/etsy_compliance_trend_design.md). Registered here as pass-through
// factors so every surface understands the keys.

const TRACTION_DECLINE: FactorDef = {
  key: "traction_decline",
  label: "Views trending down",
  dimension: "content",
  scope: "listing",
  mode: "inform",
  weight: 14,
  safe_auto_apply: false,
  pipeline_computed: true,
  description:
    "This listing's views have dropped meaningfully versus the previous two weeks — an early warning before it shows up in sales.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    return {
      passes: true, // pass-through — computed from listing_snapshots by the nightly scan
      severity: "medium",
      current_value: null,
      rationale: "Own-data traction trend.",
    };
  },
};

const RENEWAL_TIMING: FactorDef = {
  key: "renewal_timing",
  label: "Renewal coming up",
  dimension: "content",
  scope: "listing",
  mode: "inform",
  weight: 10,
  safe_auto_apply: false,
  pipeline_computed: true,
  description:
    "This listing renews soon. Whether to renew as-is or refresh it first depends on how its traffic is trending.",
  check: (ctx) => {
    if (!isListing(ctx)) return { passes: true, severity: "low", current_value: null, rationale: "" };
    return {
      passes: true, // pass-through — computed from ending_at + snapshots by the nightly scan
      severity: "low",
      current_value: null,
      rationale: "Own-data renewal timing.",
    };
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const ETSY_RANKING_FACTORS: ReadonlyArray<FactorDef> = [
  TAGS_COMPLETE,
  MATERIALS_PRESENT,
  TITLE_LENGTH,
  RETURN_POLICY_PRESENT,
  REVIEW_HEALTH,
  MARKET_TAG_GAP,
  MARKET_TITLE_LENGTH,
  TRACTION_DECLINE,
  RENEWAL_TIMING,
];

const BY_KEY = new Map(ETSY_RANKING_FACTORS.map((f) => [f.key, f]));

export function getFactor(key: string): FactorDef | undefined {
  return BY_KEY.get(key);
}

export function listingFactors(): FactorDef[] {
  return ETSY_RANKING_FACTORS.filter((f) => f.scope === "listing");
}

export function shopFactors(): FactorDef[] {
  return ETSY_RANKING_FACTORS.filter((f) => f.scope === "shop");
}
