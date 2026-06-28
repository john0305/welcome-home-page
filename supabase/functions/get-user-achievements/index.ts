import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userId = authData.user.id;

  const [{ data: achievements, error: achievementsError }, { data: earned, error: earnedError }] = await Promise.all([
    admin
      .from("achievements")
      .select("id,name,description,flavor_text,icon,category,points,is_active")
      .eq("is_active", true)
      .order("category")
      .order("points"),
    admin
      .from("user_achievements")
      .select("id,user_id,achievement_id,awarded_at,award_method,is_valid,hidden_from_user,toast_delivered,trigger_snapshot,achievements(id,name,description,flavor_text,icon,category,points)")
      .eq("user_id", userId)
      .eq("is_valid", true)
      .eq("hidden_from_user", false)
      .order("awarded_at", { ascending: false }),
  ]);

  if (achievementsError) return json({ error: achievementsError.message }, 500);
  if (earnedError) return json({ error: earnedError.message }, 500);

  return json({ achievements: achievements ?? [], earned: earned ?? [] });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}