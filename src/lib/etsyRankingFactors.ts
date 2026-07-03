/**
 * Client-side mirror of the Etsy ranking factor registry.
 *
 * METADATA ONLY — no check/generate/apply behavior. The edge-function copy at
 * supabase/functions/_shared/etsy-ranking-factors.ts is the behavioral source
 * of truth. This file exists so the UI (Store Health, ActionQueue, Echo
 * message cards, factor filters) can label, group, and color factors without
 * round-tripping to the server.
 *
 * Keep this in sync when adding factors. Same key + same dimension → safe.
 */

export type FactorMode = "auto" | "guided" | "inform";
export type FactorDimension =
  | "content"
  | "media"
  | "tags"
  | "shipping"
  | "policies"
  | "shop";
export type FactorScope = "listing" | "shop";

export interface FactorMeta {
  key: string;
  label: string;
  dimension: FactorDimension;
  scope: FactorScope;
  mode: FactorMode;
  weight: number;
  safe_auto_apply: boolean;
  description: string;
}

export const FACTOR_META: ReadonlyArray<FactorMeta> = [
  {
    key: "tags_complete",
    label: "All 13 tag slots used",
    dimension: "tags",
    scope: "listing",
    mode: "auto",
    weight: 12,
    safe_auto_apply: true,
    description:
      "Etsy gives each listing 13 tag slots — every empty one is a missed match.",
  },
  {
    key: "materials_present",
    label: "Materials field filled",
    dimension: "content",
    scope: "listing",
    mode: "auto",
    weight: 6,
    safe_auto_apply: true,
    description:
      "Materials are a secondary search signal and a trust signal for buyers.",
  },
  {
    key: "title_length",
    label: "Title uses available characters",
    dimension: "content",
    scope: "listing",
    mode: "auto",
    weight: 14,
    safe_auto_apply: false,
    description:
      "Etsy titles can be up to 140 characters. Short titles miss long-tail matches.",
  },
  {
    key: "return_policy_present",
    label: "Shop has a return policy",
    dimension: "policies",
    scope: "shop",
    mode: "guided",
    weight: 10,
    safe_auto_apply: false,
    description:
      "Buyers filter out shops with no return policy. We give you ready-to-paste text.",
  },
  {
    key: "review_health",
    label: "Review rating health",
    dimension: "shop",
    scope: "shop",
    mode: "inform",
    weight: 8,
    safe_auto_apply: false,
    description:
      "Etsy weighs review averages heavily in search. We flag drops early so you can act.",
  },
  // ── Market-intelligence factors (competitor-benchmark driven) ─────────────
  {
    key: "market_title_length",
    label: "Title shorter than competitors",
    dimension: "content",
    scope: "listing",
    mode: "guided",
    weight: 10,
    safe_auto_apply: false,
    description:
      "Competitors in your niche use longer, keyword-rich titles. Lengthening yours improves search placement.",
  },
  {
    key: "market_tag_gap",
    label: "Missing high-performing tags",
    dimension: "tags",
    scope: "listing",
    mode: "guided",
    weight: 10,
    safe_auto_apply: false,
    description:
      "Your competitors rank for tags you're not using. Adding the gap tags expands your reach.",
  },
  {
    key: "market_price_position",
    label: "Price out of niche range",
    dimension: "content",
    scope: "listing",
    mode: "inform",
    weight: 6,
    safe_auto_apply: false,
    description:
      "Your price sits outside the typical range for this niche. Adjust only if it matches your positioning.",
  },
  {
    key: "market_photo_gap",
    label: "Fewer photos than competitors",
    dimension: "media",
    scope: "listing",
    mode: "inform",
    weight: 8,
    safe_auto_apply: false,
    description:
      "Top-ranked listings in your niche use more photos. Adding more lift conversion and search rank.",
  },
  {
    key: "traction_decline",
    label: "Views trending down",
    dimension: "content",
    scope: "listing",
    mode: "inform",
    weight: 14,
    safe_auto_apply: false,
    description:
      "This listing's views have dropped versus the previous two weeks — an early warning worth a look before it shows up in sales.",
  },
  {
    key: "renewal_timing",
    label: "Renewal coming up",
    dimension: "content",
    scope: "listing",
    mode: "inform",
    weight: 10,
    safe_auto_apply: false,
    description:
      "This listing renews soon. Whether to renew as-is or refresh it first depends on how its traffic is trending.",
  },
];

const BY_KEY = new Map(FACTOR_META.map((f) => [f.key, f]));

/** Turn a snake_case factor key into a Title Case label as a last-resort fallback. */
export function humanizeFactorKey(key: string): string {
  return key
    .replace(/^market_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getFactorMeta(key: string): FactorMeta | undefined {
  return BY_KEY.get(key);
}

export const DIMENSION_LABEL: Record<FactorDimension, string> = {
  content: "Content",
  media: "Media",
  tags: "Tags",
  shipping: "Shipping",
  policies: "Policies",
  shop: "Shop",
};

export const MODE_LABEL: Record<FactorMode, string> = {
  auto: "One-tap fix",
  guided: "Copy & paste",
  inform: "Heads up",
};

/** Factors flagged as safe to enable in the onboarding allowlist by default. */
export const DEFAULT_AUTO_APPLY_ALLOWLIST = FACTOR_META
  .filter((f) => f.safe_auto_apply)
  .map((f) => f.key);
