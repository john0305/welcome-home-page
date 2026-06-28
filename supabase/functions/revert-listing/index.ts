// Revert a listing to a saved listing_versions snapshot by PATCHing Etsy and updating local state.
// Required env: ETSY_API_KEY, ETSY_SHARED_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY");
  const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET");
  const ETSY_API_KEY_HEADER = ETSY_API_KEY && ETSY_SHARED_SECRET
    ? `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`
    : ETSY_API_KEY ?? null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabaseAuth.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const { version_id } = await req.json();
    if (!version_id) return json({ error: "Missing version_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: version } = await supabase
      .from("listing_versions").select("*").eq("id", version_id).eq("user_id", userId).maybeSingle();
    if (!version) return json({ error: "Version not found" }, 404);
    if (version.restored_at) return json({ error: "Version already restored" }, 400);

    const { data: listing } = await supabase
      .from("listings").select("*").eq("id", version.listing_id).eq("user_id", userId).maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const { data: tokenRow } = await supabase
      .from("etsy_tokens").select("*").eq("user_id", userId).maybeSingle();

    // Push to Etsy if connected
    if (tokenRow && ETSY_API_KEY_HEADER) {
      const params = new URLSearchParams();
      if (version.title) params.set("title", version.title);
      if (version.description) params.set("description", version.description);
      if (version.tags?.length) params.set("tags", (version.tags as string[]).join(","));
      if (version.materials?.length) params.set("materials", (version.materials as string[]).join(","));

      const r = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${tokenRow.shop_id}/listings/${listing.etsy_listing_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${tokenRow.access_token}`,
            "x-api-key": ETSY_API_KEY_HEADER,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        },
      );
      if (!r.ok) {
        const txt = await r.text();
        return json({ error: `Etsy PATCH ${r.status}: ${txt.slice(0, 300)}` }, r.status);
      }
    }

    // Update local listing + mark version restored
    await supabase.from("listings").update({
      title: version.title, description: version.description,
      tags: version.tags ?? [], materials: version.materials ?? [],
      updated_at: new Date().toISOString(),
    }).eq("id", version.listing_id).eq("user_id", userId);

    const now = new Date().toISOString();
    await supabase.from("listing_versions").update({
      restored_at: now,
      reverted_at: now,
      revert_reason: "user_initiated",
    }).eq("id", version_id).eq("user_id", userId);

    // Log to user_listing_actions for attribution tracking
    await supabase.from("user_listing_actions").insert({
      user_id: userId,
      listing_id: String(listing.etsy_listing_id),
      action_type: "reverted",
      action_source: version.source ?? "ai",
      before_value: {
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        materials: listing.materials,
      },
      after_value: {
        title: version.title,
        description: version.description,
        tags: version.tags,
        materials: version.materials,
      },
      reverted_at: now,
      revert_reason: "user_initiated",
    });

    return json({ success: true });
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
