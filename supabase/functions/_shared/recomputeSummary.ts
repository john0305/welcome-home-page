// Shared helper: recompute a single listing's renewal summary row.
// Used by both sync-renewal-detector and backfill-renewal-history so the
// stale-score / cost / confidence math lives in exactly one place.

// deno-lint-ignore no-explicit-any
type SB = any;

export interface RenewalEvent {
  detected_at: string;
  renewal_type: "auto" | "manual" | "relist" | "unknown";
  notes: string | null;
  quantity_at_renewal: number;
  renewal_fee_usd: number;
}

export interface RenewalSnapshot {
  snapshot_date: string;
  state: string;
  quantity: number;
  price: number;
  etsy_shop_id: string;
}

export async function recomputeSummary(
  supabase: SB,
  etsy_listing_id: string,
): Promise<void> {
  const { data: events } = await supabase
    .from("listing_renewal_events")
    .select("detected_at, renewal_type, notes, quantity_at_renewal, renewal_fee_usd")
    .eq("etsy_listing_id", etsy_listing_id)
    .order("detected_at", { ascending: true });

  const { data: latestSnaps } = await supabase
    .from("listing_renewal_snapshots")
    .select("snapshot_date, state, quantity, price, etsy_shop_id")
    .eq("etsy_listing_id", etsy_listing_id)
    .order("snapshot_date", { ascending: false })
    .limit(1);

  const { data: firstSnaps } = await supabase
    .from("listing_renewal_snapshots")
    .select("snapshot_date")
    .eq("etsy_listing_id", etsy_listing_id)
    .order("snapshot_date", { ascending: true })
    .limit(1);

  // Prefer the listing's true Etsy creation date so days_since_creation
  // reflects actual age, not just when we first snapshotted it.
  const { data: listingRow } = await supabase
    .from("listings")
    .select("etsy_created_at")
    .eq("etsy_listing_id", etsy_listing_id)
    .maybeSingle();

  const latest = latestSnaps?.[0] as RenewalSnapshot | undefined;
  const first = firstSnaps?.[0] as { snapshot_date: string } | undefined;
  if (!latest || !first) return;

  const evts = (events ?? []) as RenewalEvent[];
  const total_renewals = evts.length;
  const auto_renewals = evts.filter((e) => e.renewal_type === "auto").length;
  const manual_renewals = evts.filter((e) => e.renewal_type === "manual").length;
  const relist_renewals = evts.filter((e) => e.renewal_type === "relist").length;
  const total_renewal_cost_usd = evts.reduce((s, e) => s + Number(e.renewal_fee_usd ?? 0.2), 0);
  const is_unique_item = (latest.quantity ?? 0) === 1;

  const etsyCreatedAt = (listingRow as { etsy_created_at: string | null } | null)?.etsy_created_at;
  const firstSeenDate = etsyCreatedAt
    ? new Date(etsyCreatedAt).toISOString().slice(0, 10)
    : first.snapshot_date;
  const firstSeen = new Date(firstSeenDate);
  const today = new Date();
  const days_since_creation = Math.max(
    0,
    Math.floor((today.getTime() - firstSeen.getTime()) / 86400000),
  );

  // Vacation adjustment
  const { data: vacationPeriods } = await supabase
    .from("shop_vacation_periods")
    .select("started_on, ended_on")
    .eq("etsy_shop_id", latest.etsy_shop_id);

  let vacation_days = 0;
  for (const vp of (vacationPeriods ?? []) as { started_on: string; ended_on: string | null }[]) {
    const start = new Date(vp.started_on);
    const end = vp.ended_on ? new Date(vp.ended_on) : today;
    vacation_days += Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / 86400000),
    );
  }
  const vacation_adjusted_days = Math.max(0, days_since_creation - vacation_days);

  // Stale score (unique items only)
  let estimated_stale_score = 0;
  if (is_unique_item) {
    let score = Math.min(80, Math.floor(vacation_adjusted_days / 7));
    if (total_renewals >= 3) score += 20;
    estimated_stale_score = Math.min(100, score);
  }

  // Data confidence based on event notes mix
  const inferredCount = evts.filter((e) => e.notes === "inferred_backfill").length;
  let data_confidence: "inferred" | "partial" | "observed" = "observed";
  if (total_renewals === 0) {
    data_confidence = "observed"; // nothing inferred, nothing observed — call it observed (clean slate)
  } else if (inferredCount === total_renewals) {
    data_confidence = "inferred";
  } else if (inferredCount > 0) {
    data_confidence = "partial";
  }

  await supabase.from("listing_renewal_summary").upsert({
    etsy_listing_id,
    etsy_shop_id: latest.etsy_shop_id,
    first_seen_date: firstSeenDate,
    last_renewal_date: evts.at(-1)?.detected_at ?? null,
    total_renewals,
    auto_renewals,
    manual_renewals,
    relist_renewals,
    total_renewal_cost_usd,
    is_unique_item,
    current_quantity: latest.quantity,
    current_price: latest.price,
    current_state: latest.state,
    days_since_creation,
    vacation_adjusted_days,
    estimated_stale_score,
    data_confidence,
    last_updated: new Date().toISOString(),
  });
}
