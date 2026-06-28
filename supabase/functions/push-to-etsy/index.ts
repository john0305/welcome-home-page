// Push an approved optimization back to Etsy via PATCH.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ETSY_TOKEN_URL = "https://openapi.etsy.com/v3/public/oauth/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const { optimization_id } = await req.json();
    if (!optimization_id) return json({ error: "Missing optimization_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // RadarIQ's own Etsy app credentials from server secrets.
    // Etsy requires keystring:shared_secret in x-api-key (Feb 9, 2026+).
    const clientId = String(Deno.env.get("ETSY_API_KEY") ?? "").trim();
    const clientSecret = String(Deno.env.get("ETSY_SHARED_SECRET") ?? "").trim();
    if (!clientId || !clientSecret) {
      return json({ error: "Etsy API key not configured on the server." }, 500);
    }
    const apiKeyHeader = `${clientId}:${clientSecret}`;
    // Reference removed `userId` only via tokenRow below.
    void userId;

    const { data: opt } = await supabase
      .from("optimizations").select("*").eq("id", optimization_id).eq("user_id", userId).maybeSingle();
    if (!opt || opt.status !== "pending") return json({ error: "Optimization not pending" }, 400);

    const { data: listing } = await supabase
      .from("listings").select("*").eq("id", opt.listing_id).eq("user_id", userId).maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const { data: tokenRow } = await supabase
      .from("etsy_tokens")
      .select("id, shop_id, access_token, refresh_token, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!tokenRow) return json({ error: "No Etsy connection" }, 400);

    // Block pushes while the shop is on vacation mode — Etsy rejects updates
    // and we want the optimization to stay pending so the user can retry later.
    const { data: storeRow } = await supabase
      .from("stores")
      .select("is_vacation, vacation_message")
      .eq("user_id", userId)
      .eq("etsy_shop_id", String(tokenRow.shop_id))
      .maybeSingle();
    if (storeRow?.is_vacation) {
      return json({
        error: "shop_on_vacation",
        message: "Your Etsy shop is currently in vacation mode. Etsy blocks listing updates until you turn vacation mode off. This optimization stays pending and you can approve it again once your shop is back open.",
      }, 409);
    }

    let accessToken = String(tokenRow.access_token);
    if (new Date(tokenRow.expires_at).getTime() < Date.now() + 2 * 60 * 1000) {
      const refreshRes = await fetch(ETSY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: String(tokenRow.refresh_token),
        }),
      });
      const refreshJson = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok || !refreshJson?.access_token) {
        console.error("Etsy refresh failed", refreshJson);
        return json({ error: "Etsy session expired. Please reconnect your store.", details: refreshJson }, 401);
      }
      accessToken = refreshJson.access_token;
      await supabase.from("etsy_tokens").update({
        access_token: accessToken,
        refresh_token: refreshJson.refresh_token ?? tokenRow.refresh_token,
        expires_at: new Date(Date.now() + (refreshJson.expires_in ?? 3600) * 1000).toISOString(),
      }).eq("id", tokenRow.id);
    }

    // Etsy materials accept only letters, numbers, and spaces — strip anything else
    // or the entire PATCH is rejected with "contains invalid characters".
    const sanitizeMaterial = (m: unknown) =>
      String(m)
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N} ]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 45);
    const sanitizeMaterials = (arr: unknown[]) =>
      arr.map(sanitizeMaterial).filter((m) => m.length > 0).slice(0, 13);

    // Etsy title rules: max 140 chars; the chars "& % :" may only appear ONCE
    // in the whole title. If the AI returns "Boho Wall Art & Decor & Gifts"
    // Etsy rejects the entire PATCH with "& can only be use once" and the
    // approval silently fails. Collapse extras before sending.
    const sanitizeTitle = (raw: unknown) => {
      let t = String(raw ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const limitOnce = (input: string, ch: string, replacement: string) => {
        let seen = false;
        let out = "";
        for (const c of input) {
          if (c === ch) {
            if (!seen) { out += c; seen = true; } else { out += replacement; }
          } else { out += c; }
        }
        return out;
      };
      t = limitOnce(t, "&", " and ");
      t = limitOnce(t, "%", "");
      t = limitOnce(t, ":", " -");
      return t.replace(/\s+/g, " ").trim().slice(0, 140);
    };

    // Strip ```json ... ``` fences the model occasionally leaves in suggested_text.
    const stripFences = (s: string | null | undefined): string => {
      const t = String(s ?? "").trim();
      return t.startsWith("```")
        ? t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
        : t;
    };

    const body: Record<string, unknown> = {};
    if (opt.type === "title") body.title = sanitizeTitle(opt.suggested_text);
    else if (opt.type === "description") body.description = opt.suggested_text;
    else if (opt.type === "tags") {
      try { body.tags = JSON.parse(stripFences(opt.suggested_text)); }
      catch { return json({ error: "Tags suggestion is not valid JSON array" }, 400); }
    } else if (opt.type === "materials") {
      try {
        const parsed = JSON.parse(stripFences(opt.suggested_text));
        if (!Array.isArray(parsed)) throw new Error("not array");
        body.materials = sanitizeMaterials(parsed as unknown[]);
      } catch { return json({ error: "Materials suggestion is not valid JSON array" }, 400); }
    } else if (opt.type === "full") {
      if (opt.optimized_title) body.title = sanitizeTitle(opt.optimized_title);
      if (opt.optimized_description) body.description = opt.optimized_description;
      if (Array.isArray(opt.optimized_tags) && opt.optimized_tags.length > 0) {
        body.tags = (opt.optimized_tags as string[]).slice(0, 13);
      }
      if (Array.isArray(opt.optimized_materials) && opt.optimized_materials.length > 0) {
        body.materials = sanitizeMaterials(opt.optimized_materials as unknown[]);
      }
    }


    if (Object.keys(body).length === 0) return json({ error: "Nothing to push" }, 400);

    const r = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${tokenRow.shop_id}/listings/${listing.etsy_listing_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-api-key": apiKeyHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
          Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])),
        ),
      },
    );

    if (!r.ok) {
      const txt = await r.text();
      console.error("Etsy PATCH failed", r.status, txt.slice(0, 500));
      return json({ error: `Etsy rejected the update (${r.status}). ${txt.slice(0, 300)}` }, r.status);
    }

    await supabase.from("optimizations").update({
      status: "approved", pushed_at: new Date().toISOString(),
    }).eq("id", optimization_id);

    // Phase 1 feedback capture: log approve-as-is vs. edited-after-approval.
    // Today nothing in the UI lets a user edit before approve, so the diff
    // will typically be empty (=> approved_as_is). When edit UI ships, this
    // automatically starts producing 'edited_after_approval' with a diff.
    try {
      const fieldDiffers = (a: unknown, b: unknown): boolean => {
        if (Array.isArray(a) || Array.isArray(b)) {
          const aa = Array.isArray(a) ? a : [];
          const bb = Array.isArray(b) ? b : [];
          if (aa.length !== bb.length) return true;
          return aa.some((v, i) => v !== bb[i]);
        }
        return (a ?? "") !== (b ?? "");
      };
      const aiTitle = opt.optimized_title ?? null;
      const aiDesc = opt.optimized_description ?? null;
      const aiTags = Array.isArray(opt.optimized_tags) ? opt.optimized_tags : null;
      const aiMats = Array.isArray(opt.optimized_materials) ? opt.optimized_materials : null;
      const approvedTitle = (body.title as string | undefined) ?? aiTitle;
      const approvedDesc = (body.description as string | undefined) ?? aiDesc;
      const approvedTags = (body.tags as string[] | undefined) ?? aiTags;
      const approvedMats = (body.materials as string[] | undefined) ?? aiMats;
      const diff: Record<string, { ai: unknown; approved: unknown }> = {};
      if (fieldDiffers(aiTitle, approvedTitle)) diff.title = { ai: aiTitle, approved: approvedTitle };
      if (fieldDiffers(aiDesc, approvedDesc)) diff.description = { ai: aiDesc, approved: approvedDesc };
      if (fieldDiffers(aiTags, approvedTags)) diff.tags = { ai: aiTags, approved: approvedTags };
      if (fieldDiffers(aiMats, approvedMats)) diff.materials = { ai: aiMats, approved: approvedMats };
      const hasDiff = Object.keys(diff).length > 0;
      const { data: shopRow } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", userId)
        .eq("etsy_shop_id", String(tokenRow.shop_id))
        .maybeSingle();
      await supabase.from("optimization_feedback").insert({
        user_id: userId,
        listing_id: listing.id,
        shop_id: shopRow?.id ?? null,
        optimization_run_id: optimization_id,
        action: hasDiff ? "edited_after_approval" : "approved_as_is",
        reason_category: null,
        reason_text: null,
        diff_summary: hasDiff ? diff : null,
      });
    } catch (e) {
      console.error("optimization_feedback insert failed (non-fatal)", e);
    }

    const update: Record<string, unknown> = {};
    if (opt.type === "title") update.title = body.title;
    else if (opt.type === "description") update.description = opt.suggested_text;
    else if (opt.type === "tags") update.tags = body.tags;
    else if (opt.type === "materials") update.materials = body.materials;
    else if (opt.type === "full") {
      if (body.title) update.title = body.title;
      if (body.description) update.description = body.description;
      if (body.tags) update.tags = body.tags;
      if (body.materials) update.materials = body.materials;
    }
    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      await supabase.from("listings").update(update).eq("id", listing.id);
    }

    const factorKeysByType: Record<string, string[]> = {
      title: ["title_length", "market_title_length"],
      tags: ["tags_complete", "market_tag_gap"],
      materials: ["materials_present"],
      description: ["description_quality"],
      full: ["title_length", "market_title_length", "tags_complete", "market_tag_gap", "materials_present", "description_quality"],
    };
    const resolvedFactorKeys = factorKeysByType[String(opt.type ?? "")] ?? [];
    if (resolvedFactorKeys.length > 0) {
      const resolvedAt = new Date().toISOString();
      await supabase.from("fix_actions").update({
        status: "tracking",
        applied_at: resolvedAt,
        tracking_started_at: resolvedAt,
        score_at_application: typeof listing.score === "number" ? listing.score : null,
        applied_value: body,
      })
        .eq("user_id", userId)
        .eq("listing_id", listing.id)
        .eq("status", "pending")
        .in("factor_key", resolvedFactorKeys);
    }

    // Auto re-grade the listing now that Etsy has the new content. This
    // updates listings.score AND stamps latest_grade on every approved
    // optimization, so the History tab + sidebar SEO Grade reflect the lift
    // without the user having to click "refresh grade" manually.
    let postGrade: number | null = null;
    try {
      const gradeRes = await fetch(`${SUPABASE_URL}/functions/v1/grade-listing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY,
        },
        body: JSON.stringify({ listing_id: listing.id }),
      });
      if (gradeRes.ok) {
        const g = await gradeRes.json().catch(() => null);
        const overall = typeof g?.overall_score === "number" ? g.overall_score
          : typeof g?.overall === "number" ? g.overall : null;
        if (overall != null) {
          postGrade = overall;
          const origGrade = (opt as { original_grade?: number | null }).original_grade;
          await supabase.from("optimizations").update({
            new_grade: overall,
            grade_improvement: origGrade != null ? overall - Number(origGrade) : null,
          }).eq("id", optimization_id);
        }
      } else {
        console.error("post-push grade failed", gradeRes.status, (await gradeRes.text()).slice(0, 300));
      }
    } catch (e) {
      console.error("post-push grade error (non-fatal)", e);
    }

    // Fire-and-forget: refresh embedding for this user's changed listing.
    // embed-listing dedupes via content_hash so this is cheap + idempotent.
    try {
      const embedPromise = fetch(`${SUPABASE_URL}/functions/v1/embed-listing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ backfill: true, limit: 50, user_id: userId }),
      }).catch((e) => console.error("embed-listing chain failed (non-fatal)", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(embedPromise);
      }
    } catch (e) {
      console.error("embed-listing chain setup failed (non-fatal)", e);
    }

    return json({ success: true, new_grade: postGrade });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
