// Predictive insight refresh (Section 6).
//
// Runs hourly. For each connected user, finds their modal login hour from the
// activity_hours histogram (written by the client once per session). If that
// hour is ~2 hours from now and their last action scan is older than 20h,
// re-runs the single-user action scan so the dashboard feels freshly computed
// when they open it — insights land just before the seller usually shows up.
//
// This times INSIGHT RECOMPUTATION only. The underlying Etsy data sync keeps
// its own fixed schedule (sync-all-stores at 01:00) as the reliability
// backstop: a wrong prediction simply means insights refresh on the normal
// nightly cadence instead. Requires >=5 recorded sessions before predicting
// at all — no guessing from noise.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isServiceOrCronCall } from "../_shared/service-auth.ts";

const MIN_SESSIONS = 5;
const LEAD_HOURS = 2;
const MIN_SCAN_AGE_HOURS = 20;

Deno.serve(async (req) => {
  if (!isServiceOrCronCall(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: tokens } = await supabase.from("etsy_tokens").select("user_id");
    const userIds = Array.from(new Set((tokens ?? []).map((t: { user_id: string }) => t.user_id)));
    if (userIds.length === 0) return json({ ok: true, refreshed: 0 });

    const targetHour = (new Date().getUTCHours() + LEAD_HOURS) % 24;
    const scanCutoff = new Date(Date.now() - MIN_SCAN_AGE_HOURS * 3_600_000)
      .toISOString().slice(0, 10);

    let refreshed = 0;
    for (const userId of userIds) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("activity_hours")
        .eq("id", userId)
        .maybeSingle();
      const hours = (profile?.activity_hours ?? {}) as Record<string, number>;
      const entries = Object.entries(hours);
      const totalSessions = entries.reduce((s, [, n]) => s + Number(n), 0);
      if (totalSessions < MIN_SESSIONS) continue;

      entries.sort((a, b) => Number(b[1]) - Number(a[1]));
      const modalHour = Number(entries[0][0]);
      if (modalHour !== targetHour) continue;

      // Skip if this cycle already ran for the user within the window
      // (nightly cron at 01:00-02:00 covers logins near those hours).
      const { data: recentScan } = await supabase
        .from("daily_action_summaries")
        .select("scan_date, scan_completed_at, status")
        .eq("user_id", userId)
        .gte("scan_date", scanCutoff)
        .eq("status", "complete")
        .order("scan_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentScan?.scan_completed_at &&
        Date.now() - new Date(recentScan.scan_completed_at).getTime() < MIN_SCAN_AGE_HOURS * 3_600_000) {
        continue;
      }

      // Fresh data first (sync-listings chains snapshots/embeddings itself),
      // then recompute insights on top of it.
      const base = Deno.env.get("SUPABASE_URL");
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const syncRes = await fetch(`${base}/functions/v1/sync-listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${svc}`,
          "X-Sync-Source": "cron",
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const scanRes = await fetch(`${base}/functions/v1/nightly-action-scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${svc}`,
        },
        body: JSON.stringify({ user_id: userId, source: "predictive_refresh" }),
      });
      console.log(`predictive refresh for ${userId} (modal hour ${modalHour}): sync ${syncRes.status}, scan ${scanRes.status}`);
      if (scanRes.ok) refreshed++;
    }

    return json({ ok: true, refreshed });
  } catch (e) {
    console.error("predictive-refresh error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
