/**
 * generate-fix-action
 * Input: { factor_key, listing_id? }
 * - Looks up the factor in the registry
 * - Loads the right context (listing or shop)
 * - Runs check(): if it passes, returns { ok: true, skipped: true }
 * - Runs generateFix() if defined
 * - Upserts a fix_actions row. The unique partial indexes on
 *   (user_id, listing_id, factor_key) where status='pending'
 *   (and the shop-level equivalent) guarantee dedup: any prior pending row
 *   for the same triple is flipped to status='superseded' first.
 *
 * Used by: Echo, manual "Generate fix" buttons, the nightly scanner.
 */
import {
  aiGateway,
  authedUserId,
  corsHeaders,
  json,
  loadListingCtx,
  loadShopCtx,
  makeServiceClient,
} from "../_shared/action-engine.ts";
import {
  getFactor,
  type CheckResult,
} from "../_shared/etsy-ranking-factors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { factor_key, listing_id, etsy_shop_id, source = "manual", user_id: bodyUserId } = body;

    // Auth: prefer logged-in user; allow service-role callers to pass user_id explicitly.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceCall = !!token && !!SERVICE_KEY && token === SERVICE_KEY;
    let userId: string | null = null;
    if (isServiceCall && bodyUserId) {
      userId = bodyUserId;
    } else {
      userId = await authedUserId(req);
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);

    if (!factor_key) return json({ error: "Missing factor_key" }, 400);

    const factor = getFactor(factor_key);
    if (!factor) return json({ error: `Unknown factor: ${factor_key}` }, 400);

    const supabase = makeServiceClient();

    const ctx = factor.scope === "listing"
      ? (listing_id ? await loadListingCtx(supabase, userId, listing_id) : null)
      : await loadShopCtx(supabase, userId, etsy_shop_id);
    if (!ctx) return json({ error: "Context not found for this user/scope" }, 404);

    const checkResult: CheckResult = await factor.check(ctx);

    // Self-resolution: if the factor passes now, nothing to do (and supersede
    // any leftover pending row for the same triple).
    if (checkResult.passes) {
      await supersedePending(supabase, userId, factor_key, listing_id ?? null,
        factor.scope === "shop" ? (ctx as { etsy_shop_id: string }).etsy_shop_id : null,
        "resolved_externally");
      return json({ ok: true, skipped: true, reason: "factor_passes" });
    }

    let proposed: unknown = null;
    let rationale = checkResult.rationale;
    let guided_payload: unknown = null;
    let mode = factor.mode;

    if (factor.generateFix) {
      try {
        const fix = await factor.generateFix(ctx, aiGateway());
        if (!fix) {
          return json({ ok: true, skipped: true, reason: "no_fix_generated" });
        }
        proposed = fix.proposed_value;
        rationale = fix.rationale || rationale;
        if (fix.guided_payload) {
          guided_payload = fix.guided_payload;
          // generateFix can override mode to guided (e.g. shop-level policies)
          mode = "guided";
        }
      } catch (e) {
        console.error("generateFix failed", factor_key, e);
        // Fall back to inform mode so the seller still sees the issue.
        mode = "inform";
        rationale = `${rationale} (Couldn't auto-draft a fix this round — try again later.)`;
      }
    }

    // Dedup: supersede any prior pending row for the same triple before insert.
    await supersedePending(supabase, userId, factor_key, listing_id ?? null,
      factor.scope === "shop" ? (ctx as { etsy_shop_id: string }).etsy_shop_id : null,
      "replaced_by_newer");

    const insertRow = {
      user_id: userId,
      listing_id: factor.scope === "listing" ? (listing_id ?? null) : null,
      etsy_shop_id: factor.scope === "shop"
        ? (ctx as { etsy_shop_id: string }).etsy_shop_id
        : null,
      factor_key,
      dimension: factor.dimension,
      mode,
      severity: checkResult.severity,
      current_value: checkResult.current_value as object | null,
      proposed_value: proposed as object | null,
      rationale,
      evidence: checkResult.evidence ?? null,
      guided_payload: guided_payload as object | null,
      source,
      status: "pending" as const,
    };

    const { data: inserted, error } = await supabase
      .from("fix_actions")
      .insert(insertRow)
      .select()
      .single();
    if (error) {
      console.error("insert fix_action failed", error);
      return json({ error: error.message }, 500);
    }

    // Mirror into fix_lifecycle as an "open" issue if this is a listing-scope
    // factor we can map to a tracked field.
    if (factor.scope === "listing" && listing_id) {
      try {
        const { factorKeyToField, openFixServer } = await import("../_shared/fix-lifecycle.ts");
        const field = factorKeyToField(factor_key);
        if (field) {
          await openFixServer(supabase, {
            user_id: userId,
            listing_id,
            shop_id: String((ctx as { etsy_shop_id?: string | number })?.etsy_shop_id ?? ""),
            field,
            issue_description: rationale ?? null,
            suggested_fix: typeof proposed === "string" ? proposed : (proposed ? JSON.stringify(proposed) : null),
            source: "action_engine",
            before_value: checkResult.current_value == null ? null : String(typeof checkResult.current_value === "string" ? checkResult.current_value : JSON.stringify(checkResult.current_value)),
          });
        }
      } catch (e) {
        console.warn("fix_lifecycle openFix failed", e);
      }
    }

    return json({ ok: true, fix_action: inserted });
  } catch (err) {
    console.error("generate-fix-action error", err);
    return json({ error: String(err) }, 500);
  }
});

async function supersedePending(
  supabase: ReturnType<typeof makeServiceClient>,
  userId: string,
  factor_key: string,
  listing_id: string | null,
  etsy_shop_id: string | null,
  reason: string,
) {
  const q = supabase.from("fix_actions")
    .update({ status: "superseded", superseded_reason: reason })
    .eq("user_id", userId)
    .eq("factor_key", factor_key)
    .eq("status", "pending");
  if (listing_id) {
    await q.eq("listing_id", listing_id);
  } else if (etsy_shop_id) {
    await q.is("listing_id", null).eq("etsy_shop_id", etsy_shop_id);
  } else {
    await q.is("listing_id", null);
  }
}
