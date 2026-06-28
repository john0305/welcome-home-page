/**
 * apply-fix-action
 * Input: { fix_action_id, edited_value? }
 *
 * The single entry point for approving any pending fix_action. Flow:
 *   1. Load action + factor definition
 *   2. If edited_value provided, treat as 'edited_applied'
 *   3. Call factor.applyFix() with the (possibly edited) proposed value
 *   4. On success → status='applied' (or 'edited_applied'), stamp etsy_response
 *   5. On failure → if demote_to_guided, flip mode='guided' and populate
 *      guided_payload so the UI can offer Copy + Open in Etsy instead of a
 *      dead end. Otherwise mark status='failed' with a human reason.
 */
import {
  authedUserId,
  corsHeaders,
  etsyApiFor,
  json,
  loadListingCtx,
  loadShopCtx,
  makeServiceClient,
} from "../_shared/action-engine.ts";
import { getFactor } from "../_shared/etsy-ranking-factors.ts";
import { logWriteCall } from "../_shared/etsy-quota.ts";
import { factorKeyToField, markAppliedServer } from "../_shared/fix-lifecycle.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { fix_action_id, edited_value, user_id: bodyUserId } = body;
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
    if (!fix_action_id) return json({ error: "Missing fix_action_id" }, 400);

    const supabase = makeServiceClient();

    const { data: action } = await supabase
      .from("fix_actions")
      .select("*")
      .eq("id", fix_action_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!action) return json({ error: "Fix action not found" }, 404);
    if (action.status !== "pending") {
      return json({ error: `Action is already ${action.status}` }, 400);
    }

    const factor = getFactor(action.factor_key);
    if (!factor) return json({ error: "Unknown factor" }, 400);

    // Inform-only actions have no apply path — just mark dismissed/acknowledged.
    if (action.mode === "inform" || !factor.applyFix) {
      const { data: updated } = await supabase
        .from("fix_actions")
        .update({ status: "dismissed", applied_at: new Date().toISOString() })
        .eq("id", fix_action_id)
        .select()
        .single();
      return json({ ok: true, fix_action: updated, kind: "acknowledged" });
    }

    const proposed = edited_value !== undefined ? edited_value : action.proposed_value;
    if (proposed === null || proposed === undefined) {
      return json({ error: "Nothing to apply" }, 400);
    }

    const ctx = factor.scope === "listing"
      ? (action.listing_id ? await loadListingCtx(supabase, userId, action.listing_id) : null)
      : await loadShopCtx(supabase, userId, action.etsy_shop_id ?? undefined);
    if (!ctx) return json({ error: "Context no longer available" }, 410);

    let result: Awaited<ReturnType<NonNullable<typeof factor.applyFix>>>;
    try {
      const api = await etsyApiFor(supabase, userId);
      result = await factor.applyFix(ctx, proposed, api);
    } catch (err) {
      console.warn("apply-fix-action: demoting to guided due to thrown error", err);
      result = {
        ok: false,
        demote_to_guided: true,
        failure_reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (result.ok) {
      // Capture listing score now so we have a baseline for 7-day evaluation.
      let scoreAtApplication: number | null = null;
      if (action.listing_id) {
        const { data: listingRow } = await supabase
          .from("listings")
          .select("score")
          .eq("id", action.listing_id)
          .maybeSingle();
        scoreAtApplication = typeof listingRow?.score === "number" ? listingRow.score : null;
      }

      const appliedAt = new Date().toISOString();
      const { data: updated } = await supabase
        .from("fix_actions")
        .update({
          status: "tracking",
          applied_at: appliedAt,
          tracking_started_at: appliedAt,
          score_at_application: scoreAtApplication,
          applied_value: result.applied_value as object | null,
          etsy_response: result.etsy_response as object | null,
        })
        .eq("id", fix_action_id)
        .select()
        .single();

      // Log write to quota tracker + action history
      await Promise.all([
        logWriteCall(supabase, {
          endpoint: `listings/${action.listing_id ?? "shop"}`,
          user_id: userId,
          success: true,
        }),
        supabase.from("user_listing_actions").insert({
          user_id: userId,
          listing_id: action.listing_id
            ? String((ctx as { etsy_listing_id?: string | number })?.etsy_listing_id ?? action.listing_id)
            : String(action.etsy_shop_id ?? ""),
          action_type: action.factor_key,
          action_source: "guided_fix",
          before_value: action.current_value as object | null,
          after_value: result.applied_value as object | null,
          attribution_window_ends: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ]);

      // Reflect the change on our local listings row so the UI shows the
      // applied value without waiting for the next sync. We also optimistically
      // bump listings.score by the action's expected score_delta — the trigger
      // on listings.score recalculates store_health_score, which propagates to
      // the dashboard ring via the realtime channel in seconds rather than
      // waiting for the nightly regrade.
      if (factor.scope === "listing" && action.listing_id) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (action.factor_key === "tags_complete") patch.tags = result.applied_value;
        else if (action.factor_key === "materials_present") patch.materials = result.applied_value;
        else if (action.factor_key === "title_length") patch.title = result.applied_value;

        const delta = typeof action.score_delta === "number" ? action.score_delta : 0;
        if (delta > 0 && typeof scoreAtApplication === "number") {
          const newScore = Math.max(0, Math.min(100, scoreAtApplication + delta));
          patch.score = newScore;
          patch.last_graded = appliedAt;
        }

        if (Object.keys(patch).length > 1) {
          await supabase.from("listings").update(patch).eq("id", action.listing_id);

          // Recalculate store health score directly to ensure it updates and fires the Realtime trigger
          const { data: listingInfo } = await supabase
            .from("listings")
            .select("store_id")
            .eq("id", action.listing_id)
            .maybeSingle();

          const storeId = listingInfo?.store_id;
          if (storeId) {
            const { data: activeListings } = await supabase
              .from("listings")
              .select("score")
              .eq("store_id", storeId)
              .eq("state", "active")
              .not("score", "is", null);

            if (activeListings && activeListings.length > 0) {
              const sum = activeListings.reduce((acc: number, curr: { score: number | null }) => acc + (curr.score ?? 0), 0);
              const avgScore = Math.round(sum / activeListings.length);
              
              await supabase
                .from("stores")
                .update({ store_health_score: avgScore, updated_at: new Date().toISOString() })
                .eq("id", storeId);
            }
          }
        }
      }

      // Mirror into fix_lifecycle so the listing's Fix Queue shrinks.
      const lifecycleField = factorKeyToField(action.factor_key);
      if (factor.scope === "listing" && action.listing_id && lifecycleField) {
        try {
          await markAppliedServer(supabase, {
            user_id: userId,
            listing_id: action.listing_id,
            shop_id: String(action.etsy_shop_id ?? (ctx as { etsy_shop_id?: string | number })?.etsy_shop_id ?? ""),
            field: lifecycleField,
            source: "action_engine",
            before_value: action.current_value == null ? null : String(typeof action.current_value === "string" ? action.current_value : JSON.stringify(action.current_value)),
            after_value: result.applied_value == null ? null : String(typeof result.applied_value === "string" ? result.applied_value : JSON.stringify(result.applied_value)),
          });
        } catch (e) {
          console.warn("fix_lifecycle markApplied failed", e);
        }
      }

      // Fire-and-forget: rebuild shop_intelligence so Echo has fresh context
      // without blocking the user's response.
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const rebuildPromise = fetch(
        `${supabaseUrl}/functions/v1/rebuild-shop-intelligence`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ user_id: userId, trigger: "fix_applied" }),
        },
      ).then((r) => {
        console.log(`rebuild-shop-intelligence triggered for ${userId}: HTTP ${r.status}`);
      }).catch((e) => {
        console.error(`rebuild-shop-intelligence trigger failed for ${userId}`, e);
      });
      // @ts-ignore — EdgeRuntime keeps the promise alive after the response is sent
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(rebuildPromise);
      }

      return json({ ok: true, fix_action: updated, kind: "applied" });
    }

    // Failure path — demote to guided if the factor says it's safe to do so.
    if (result.demote_to_guided) {
      const guided_payload = {
        instructions: `Etsy rejected the automated update (${result.failure_reason ?? "unknown error"}). Copy the proposed value below and paste it into Etsy directly.`,
        copyable_content: typeof proposed === "string" ? proposed : JSON.stringify(proposed, null, 2),
        etsy_deep_link: factor.scope === "listing" && ctx && "etsy_listing_id" in ctx
          ? `https://www.etsy.com/your/shops/me/tools/listings/${(ctx as { etsy_listing_id: string | number }).etsy_listing_id}`
          : "https://www.etsy.com/your/shops/me",
      };
      const { data: updated } = await supabase
        .from("fix_actions")
        .update({
          mode: "guided",
          guided_payload,
          failure_reason: result.failure_reason ?? null,
          etsy_response: result.etsy_response as object | null,
        })
        .eq("id", fix_action_id)
        .select()
        .single();
      return json({
        ok: false,
        kind: "demoted_to_guided",
        fix_action: updated,
        reason: result.failure_reason,
      });
    }

    const { data: updated } = await supabase
      .from("fix_actions")
      .update({
        status: "failed",
        failure_reason: result.failure_reason ?? "unknown",
        etsy_response: result.etsy_response as object | null,
      })
      .eq("id", fix_action_id)
      .select()
      .single();
    return json({ ok: false, kind: "failed", fix_action: updated, reason: result.failure_reason }, 502);
  } catch (err) {
    console.error("apply-fix-action error", err);
    return json({ error: String(err) }, 500);
  }
});
