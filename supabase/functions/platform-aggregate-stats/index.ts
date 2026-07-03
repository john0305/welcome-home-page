// Recomputes platform-wide medians from non-anomalous attribution rows and
// writes them to the singleton platform_stats_cache row.
// Callers: admin UI (AdminPerformance) and internal pipeline — admin or service role only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isAdminCall, isServiceCall } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isServiceCall(req) && !(await isAdminCall(req))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Pull a paginated set (cap 5k rows for cache compute — sufficient for medians)
    const { data: rows30 } = await supabase.from("performance_attribution")
      .select("views_pct, sales_pct, score_delta")
      .eq("window_days", 30)
      .eq("is_sufficient_data", true)
      .eq("is_anomaly", false)
      .neq("admin_review_status", "invalid")
      .limit(5000);

    const { count: totalOpt } = await supabase.from("optimizations")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");

    const safe = (rows30 ?? []);
    const viewsPcts = safe.map(r => r.views_pct).filter((v): v is number => v != null);
    const salesPcts = safe.map(r => r.sales_pct).filter((v): v is number => v != null);
    const scoreDeltas = safe.map(r => r.score_delta).filter((v): v is number => v != null);
    const positives = safe.filter(r => (r.views_pct ?? 0) > 0 || (r.sales_pct ?? 0) > 0 || (r.score_delta ?? 0) > 0);

    const median = (xs: number[]) => {
      if (xs.length === 0) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10 : s[m];
    };

    const payload = {
      id: 1,
      total_optimizations: totalOpt ?? 0,
      median_score_improvement: median(scoreDeltas),
      median_views_lift_30d: median(viewsPcts),
      median_sales_lift_30d: median(salesPcts),
      pct_positive_delta: safe.length > 0 ? Math.round((positives.length / safe.length) * 1000) / 10 : null,
      computed_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("platform_stats_cache").upsert(payload);
    if (error) throw error;

    return json({ ok: true, ...payload });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
