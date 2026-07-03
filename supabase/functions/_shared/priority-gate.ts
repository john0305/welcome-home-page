// Priority/confidence gate (Section 5) — the single place that decides which
// findings are allowed to interrupt the seller. Design goals:
//   1. Notifications only for high-confidence, high-impact findings.
//   2. Hard daily cap so the channel never becomes noise (sellers tune out fast).
//   3. Self-correcting via outcome history (Section 8): factor types the seller
//      consistently dismisses lose priority; types they act on gain it.
// Everything below the bar still surfaces quietly in the dashboard queue.

const NOTIFY_SCORE_FLOOR = 70;
const NOTIFY_DAILY_CAP = 3;

const SEVERITY_BASE: Record<string, number> = {
  critical: 55,
  high: 45,
  medium: 30,
  low: 15,
};

interface ActionRow {
  id: string;
  factor_key: string;
  severity: string | null;
  mode: string | null;
  score_delta: number | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

interface FactorStats {
  applied: number;
  dismissed: number;
}

export function computePriority(a: ActionRow, stats: FactorStats | undefined): number {
  let score = SEVERITY_BASE[a.severity ?? "medium"] ?? 30;

  // Expected impact: score_delta points, capped so impact can't drown severity.
  const delta = Number(a.score_delta ?? 0);
  if (delta > 0) score += Math.min(25, delta * 2);

  // One-tap actionable findings are worth slightly more interruption.
  if (a.mode === "auto") score += 5;

  // Confidence: findings grounded in the seller's own history are safest.
  const src = a.evidence && (a.evidence as { data_source?: string }).data_source;
  if (src === "own_listing_snapshots") score += 5;

  // Outcome feedback (Section 8): learn from what this seller actually does.
  if (stats && stats.applied + stats.dismissed >= 3) {
    const total = stats.applied + stats.dismissed;
    const dismissRate = stats.dismissed / total;
    const adoptRate = stats.applied / total;
    if (dismissRate > 0.5) score -= 20;
    else if (adoptRate > 0.5) score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Scores every pending action for the user and flags at most
 * NOTIFY_DAILY_CAP fresh (last 24h), high-scoring ones as notify_worthy.
 * Called at the end of each nightly scan.
 */
export async function applyPriorityGate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ scored: number; notify_worthy: number }> {
  const { data: pending } = await supabase
    .from("fix_actions")
    .select("id, factor_key, severity, mode, score_delta, evidence, created_at")
    .eq("user_id", userId)
    .eq("status", "pending");
  if (!pending?.length) return { scored: 0, notify_worthy: 0 };

  // 90-day outcome history per factor type for this seller.
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: outcomes } = await supabase
    .from("fix_actions")
    .select("factor_key, status")
    .eq("user_id", userId)
    .in("status", ["applied", "edited_applied", "dismissed"])
    .gte("created_at", since);

  const statsByFactor = new Map<string, FactorStats>();
  for (const o of (outcomes ?? []) as { factor_key: string; status: string }[]) {
    const s = statsByFactor.get(o.factor_key) ?? { applied: 0, dismissed: 0 };
    if (o.status === "dismissed") s.dismissed++;
    else s.applied++;
    statsByFactor.set(o.factor_key, s);
  }

  const dayAgo = Date.now() - 86_400_000;
  const scored = (pending as ActionRow[]).map((a) => ({
    id: a.id,
    score: computePriority(a, statsByFactor.get(a.factor_key)),
    fresh: new Date(a.created_at).getTime() >= dayAgo,
  }));

  // Persist scores; reset the notify flag before re-flagging today's winners.
  for (const s of scored) {
    await supabase.from("fix_actions")
      .update({ priority_score: s.score, notify_worthy: false })
      .eq("id", s.id);
  }

  const winners = scored
    .filter((s) => s.fresh && s.score >= NOTIFY_SCORE_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, NOTIFY_DAILY_CAP);

  for (const w of winners) {
    await supabase.from("fix_actions").update({ notify_worthy: true }).eq("id", w.id);
  }

  return { scored: scored.length, notify_worthy: winners.length };
}
