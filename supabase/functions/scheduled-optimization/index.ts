// Nightly queue runner — submits queued `optimizations` rows as a single
// Anthropic Message Batch (50% discount, 24h SLA) and polls in-flight
// batches, writing suggested_text back when complete.
//
// Modes (query param or body `mode`):
//   - "submit" (default): pick all status='queued' rows with no batch id,
//     build prompts, submit a single batch, stamp anthropic_batch_id +
//     anthropic_batch_status='in_progress' on each row.
//   - "poll": find distinct anthropic_batch_id values for rows still
//     in non-terminal status, poll them, and when ended download results
//     and update each row with suggested_text + status='pending'
//     (or status='rejected' + reject_reason on errored items).
//
// When the `nightly_queue` slot is NOT anthropic, submit mode is a no-op
// (gateway/inline tasks are handled by other functions); poll mode also
// no-ops since there will be no batch ids to resolve.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getModelFor,
  submitAnthropicBatch,
  pollAnthropicBatch,
  fetchAnthropicBatchResults,
  type BatchItem,
} from "../_shared/ai-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BATCH_ITEMS = 500; // Anthropic supports up to 10k; we cap for safety.

type OptType = "title" | "tags" | "description";

interface Listing {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  clarifying_answers: Record<string, string> | null;
  score_breakdown: { factors?: Record<string, { score?: number; issue?: string }> } | null;
}

interface QueuedRow {
  id: string;
  user_id: string;
  listing_id: string;
  type: OptType;
}

const ANTI_FAB = `\nABSOLUTE ANTI-FABRICATION RULES:
- NEVER invent measurements, dimensions, weights, lengths, widths, sizes, or any numeric spec. Only repeat numbers already in the seller's original title/description or in clarifying answers. If a spec isn't provided, omit it.
- NEVER invent era, origin, provenance, brand, designer, maker, materials, or historical claims not already present.`;

function buildPrompt(type: OptType, listing: Listing): { prompt: string; original: string } {
  const breakdown = listing.score_breakdown ?? {};
  const factor = breakdown.factors?.[type];
  const answers = listing.clarifying_answers ?? null;
  const answersBlock = answers && Object.keys(answers).length
    ? "\nSeller clarifying answers (authoritative facts):\n" +
      Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n") + "\n"
    : "";

  if (type === "title") {
    const original = listing.title ?? "";
    return {
      original,
      prompt: `Rewrite this Etsy listing title for maximum SEO.
Current title: ${original}
Current description (for context, do not invent from): ${(listing.description ?? "").slice(0, 600)}
Current score: ${factor?.score ?? "?"}/20
Issue: ${factor?.issue ?? "n/a"}
${answersBlock}Rules: 120-140 characters, primary keyword first, natural language, no keyword stuffing.${ANTI_FAB}
Return ONLY the new title, no quotes, no explanation.`,
    };
  }
  if (type === "tags") {
    const original = JSON.stringify(listing.tags ?? []);
    return {
      original,
      prompt: `Generate 13 Etsy tags for this listing.
Title: ${listing.title}
Current tags: ${original}
Current score: ${factor?.score ?? "?"}/20
${answersBlock}Rules: mix long-tail (3-4 words) and broad terms, all 13 slots, max 20 chars each, no duplicate words across tags. Do not invent dimensions, weights, era, or materials not present in the original.
Return ONLY a JSON array of 13 strings.`,
    };
  }
  const original = listing.description ?? "";
  return {
    original,
    prompt: `Rewrite this Etsy listing description for SEO.
Current description: ${original.slice(0, 1200)}
Title: ${listing.title}
Current score: ${factor?.score ?? "?"}/15
${answersBlock}Rules: 150-200 words, include primary keywords naturally, short paragraphs, end with a call to action, preserve the seller's voice.${ANTI_FAB}
Return ONLY the rewritten description.`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Authorize: accept (a) CRON_SECRET via x-cron-trigger, (b) legacy x-cron-secret
  // from vault, or (c) service-role bearer (manual admin invocation).
  const authHeader = req.headers.get("Authorization");
  const cronSecretEnv = Deno.env.get("CRON_SECRET");
  const incomingCronTrigger = req.headers.get("x-cron-trigger");
  const cronSecret = req.headers.get("x-cron-secret");
  let authorized = authHeader === `Bearer ${SERVICE_KEY}`;
  if (!authorized && cronSecretEnv && incomingCronTrigger === cronSecretEnv) authorized = true;
  if (!authorized && cronSecret) {
    const { data: vaultRow } = await supabase
      .schema("vault" as never)
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "sync_cron_secret")
      .maybeSingle();
    const stored = (vaultRow as { decrypted_secret?: string } | null)?.decrypted_secret;
    if (stored && cronSecret === stored) authorized = true;
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  let mode = new URL(req.url).searchParams.get("mode") ?? "submit";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch { /* ignore */ }
  }

  try {
    if (mode === "poll") return json(await runPoll(supabase));
    if (mode === "milestones") return json(await runMilestoneScan(supabase));
    const submitRes = await runSubmit(supabase);
    // Always run the milestone scan alongside submit (it's cheap + idempotent).
    let milestoneRes: unknown = null;
    try { milestoneRes = await runMilestoneScan(supabase); }
    catch (e) { milestoneRes = { error: String(e) }; }
    return json({ ...submitRes, milestones: milestoneRes });
  } catch (err) {
    console.error("[scheduled-optimization]", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Submit ───────────────────────────────────────────────────────────────────
async function runSubmit(supabase: ReturnType<typeof createClient>) {
  const cfg = await getModelFor("nightly_queue");
  if (cfg.provider !== "anthropic" || !cfg.batch_enabled) {
    return { mode: "submit", skipped: true, reason: `nightly_queue provider=${cfg.provider} batch_enabled=${cfg.batch_enabled}` };
  }

  const { data: rows, error } = await supabase
    .from("optimizations")
    .select("id, user_id, listing_id, type")
    .eq("status", "queued")
    .is("anthropic_batch_id", null)
    .limit(MAX_BATCH_ITEMS);
  if (error) throw error;
  const queued = (rows ?? []) as QueuedRow[];
  if (queued.length === 0) return { mode: "submit", queued: 0 };

  // Fetch all referenced listings in one round-trip
  const listingIds = Array.from(new Set(queued.map((r) => r.listing_id)));
  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, description, tags, clarifying_answers, score_breakdown")
    .in("id", listingIds);
  const byId = new Map<string, Listing>((listings ?? []).map((l) => [l.id, l as Listing]));

  const items: BatchItem[] = [];
  const skipped: string[] = [];
  const originals = new Map<string, string>();
  for (const row of queued) {
    if (!["title", "tags", "description"].includes(row.type)) { skipped.push(row.id); continue; }
    const listing = byId.get(row.listing_id);
    if (!listing) { skipped.push(row.id); continue; }
    const { prompt, original } = buildPrompt(row.type, listing);
    originals.set(row.id, original);
    items.push({
      custom_id: row.id,
      model: cfg.model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
  }
  if (items.length === 0) return { mode: "submit", queued: queued.length, skipped: skipped.length, submitted: 0 };

  const res = await submitAnthropicBatch(items);
  if ("error" in res) throw new Error(res.error);

  // Stamp every row included in the batch.
  const includedIds = items.map((i) => i.custom_id);
  const { error: upErr } = await supabase
    .from("optimizations")
    .update({
      anthropic_batch_id: res.id,
      anthropic_batch_status: res.processing_status,
      model_used: cfg.model,
    })
    .in("id", includedIds);
  if (upErr) throw upErr;

  // Persist captured originals (one-by-one because values differ per row).
  for (const id of includedIds) {
    const original = originals.get(id) ?? "";
    await supabase.from("optimizations")
      .update({ original_text: original })
      .eq("id", id)
      .is("original_text", null);
  }

  return { mode: "submit", batch_id: res.id, submitted: items.length, skipped: skipped.length };
}

// ── Poll ─────────────────────────────────────────────────────────────────────
async function runPoll(supabase: ReturnType<typeof createClient>) {
  const { data: rows, error } = await supabase
    .from("optimizations")
    .select("anthropic_batch_id")
    .not("anthropic_batch_id", "is", null)
    .neq("anthropic_batch_status", "ended")
    .neq("anthropic_batch_status", "canceled");
  if (error) throw error;
  const batchIds = Array.from(new Set((rows ?? []).map((r) => r.anthropic_batch_id as string).filter(Boolean)));
  if (batchIds.length === 0) return { mode: "poll", batches: 0 };

  const summaries: Array<Record<string, unknown>> = [];
  for (const batchId of batchIds) {
    const status = await pollAnthropicBatch(batchId);
    if ("error" in status) { summaries.push({ batch_id: batchId, error: status.error }); continue; }

    // Always sync the status field across all rows in this batch.
    await supabase.from("optimizations")
      .update({ anthropic_batch_status: status.processing_status })
      .eq("anthropic_batch_id", batchId);

    if (status.processing_status !== "ended" || !status.results_url) {
      summaries.push({ batch_id: batchId, status: status.processing_status, counts: status.request_counts });
      continue;
    }

    // Fetch and apply results
    const results = await fetchAnthropicBatchResults(status.results_url);
    let succeeded = 0, errored = 0;
    for (const r of results) {
      if (r.result.type === "succeeded") {
        const text = (r.result.message?.content ?? [])
          .filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
        await supabase.from("optimizations")
          .update({ suggested_text: text, status: "pending" })
          .eq("id", r.custom_id);
        succeeded++;
      } else {
        await supabase.from("optimizations")
          .update({
            status: "rejected",
            reject_reason: r.result.error?.message ?? r.result.type,
          })
          .eq("id", r.custom_id);
        errored++;
      }
    }
    summaries.push({ batch_id: batchId, status: "ended", succeeded, errored, total: results.length });
  }

  return { mode: "poll", batches: batchIds.length, results: summaries };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Milestone scan ───────────────────────────────────────────────────────────
// Surfaces optimization-impact items into wins_feed (kind='optimization_impact')
// at 7 / 14 / 30-day post-approval windows. Idempotent via attribution_id.
type Snap = { recorded_on: string; views: number; favorites: number; quantity: number };
type ApprovedOpt = { id: string; user_id: string; listing_id: string; updated_at: string };

const MILESTONE_WINDOWS = [
  { days: 7, label: "7-DAY WIN", lo: 8, hi: 7 },
  { days: 14, label: "14-DAY WIN", lo: 15, hi: 14 },
  { days: 30, label: "30-DAY WIN", lo: 31, hi: 30 },
];

async function runMilestoneScan(supabase: ReturnType<typeof createClient>) {
  const now = Date.now();
  const earliest = new Date(now - 32 * 86400000).toISOString();
  const latest = new Date(now - 6 * 86400000).toISOString();

  const { data: opts, error } = await supabase
    .from("optimizations")
    .select("id, user_id, listing_id, updated_at")
    .eq("status", "approved")
    .gte("updated_at", earliest)
    .lte("updated_at", latest);
  if (error) throw error;
  const approved = (opts ?? []) as ApprovedOpt[];
  if (approved.length === 0) return { mode: "milestones", processed: 0, inserted: 0 };

  // Dedupe existing wins_feed rows (attribution_id, window_days)
  const optIds = approved.map((o) => o.id);
  const { data: existing } = await supabase
    .from("wins_feed")
    .select("attribution_id, window_days")
    .eq("kind", "optimization_impact")
    .in("attribution_id", optIds);
  const existingKey = new Set<string>(
    (existing ?? []).map((e) => `${e.attribution_id}:${e.window_days}`),
  );

  // Group by shop (user_id) to enforce 3-per-shop cap
  const byUser = new Map<string, ApprovedOpt[]>();
  for (const o of approved) {
    if (!byUser.has(o.user_id)) byUser.set(o.user_id, []);
    byUser.get(o.user_id)!.push(o);
  }

  let inserted = 0;
  for (const [userId, userOpts] of byUser) {
    // Score each (opt, window) candidate by abs view delta, then insert top 3.
    type Cand = {
      opt: ApprovedOpt; window: typeof MILESTONE_WINDOWS[number];
      before: Snap; after: Snap; viewsDelta: number; viewsPct: number | null;
      favsDelta: number; salesDelta: number;
    };
    const candidates: Cand[] = [];

    // Fetch listing titles + snapshots in batches per user
    const listingIds = Array.from(new Set(userOpts.map((o) => o.listing_id)));
    const { data: snapsAll } = await supabase
      .from("listing_snapshots")
      .select("listing_id, recorded_on, views, favorites, quantity")
      .eq("user_id", userId)
      .in("listing_id", listingIds)
      .order("recorded_on", { ascending: true });
    const snapsByListing = new Map<string, Snap[]>();
    for (const s of (snapsAll ?? []) as (Snap & { listing_id: string })[]) {
      if (!snapsByListing.has(s.listing_id)) snapsByListing.set(s.listing_id, []);
      snapsByListing.get(s.listing_id)!.push({
        recorded_on: s.recorded_on, views: s.views, favorites: s.favorites, quantity: s.quantity,
      });
    }

    for (const opt of userOpts) {
      const approvedTs = new Date(opt.updated_at).getTime();
      const ageDays = Math.floor((now - approvedTs) / 86400000);
      const window = MILESTONE_WINDOWS.find((w) => ageDays >= w.hi && ageDays < w.lo);
      if (!window) continue;
      if (existingKey.has(`${opt.id}:${window.days}`)) continue;

      const snaps = snapsByListing.get(opt.listing_id) ?? [];
      if (snaps.length < 2) continue;
      const before = [...snaps].reverse().find((s) => new Date(s.recorded_on).getTime() < approvedTs);
      const after = snaps[snaps.length - 1];
      if (!before || !after || new Date(after.recorded_on).getTime() <= approvedTs) continue;
      const viewsDelta = (after.views ?? 0) - (before.views ?? 0);
      const viewsPct = before.views > 0 ? (viewsDelta / before.views) * 100 : null;
      candidates.push({
        opt, window, before, after, viewsDelta, viewsPct,
        favsDelta: (after.favorites ?? 0) - (before.favorites ?? 0),
        salesDelta: (after.quantity ?? 0) - (before.quantity ?? 0),
      });
    }

    // Top 3 by absolute view delta
    candidates.sort((a, b) => Math.abs(b.viewsDelta) - Math.abs(a.viewsDelta));
    const top = candidates.slice(0, 3);
    if (top.length === 0) continue;

    // Fetch listing titles
    const { data: listings } = await supabase
      .from("listings")
      .select("id, title")
      .in("id", top.map((c) => c.opt.listing_id));
    const titleById = new Map<string, string>((listings ?? []).map((l) => [l.id as string, (l.title as string) ?? "Listing"]));

    for (const c of top) {
      const title = titleById.get(c.opt.listing_id) ?? "Listing";
      const pctStr = c.viewsPct != null ? `${c.viewsPct >= 0 ? "+" : ""}${c.viewsPct.toFixed(1)}%` : `${c.viewsDelta >= 0 ? "+" : ""}${c.viewsDelta}`;
      let kindTag: string;
      let headline: string;
      if (c.viewsPct != null && c.viewsPct >= 10) {
        kindTag = c.window.label;
        headline = `🟢 IMPACT: ${title} — views ${pctStr} in ${c.window.days} days since optimization (${c.before.views} → ${c.after.views})`;
      } else if (c.viewsDelta >= 0) {
        kindTag = "TRACKING";
        headline = `◎ TRACKING: ${title} — ${c.window.days} days post-optimization, views ${pctStr} (still early)`;
      } else {
        kindTag = "CHECK IN";
        headline = `🟡 CHECK IN: ${title} — views ${pctStr} since optimization ${c.window.days} days ago. Etsy re-indexing can take 1–2 weeks.`;
      }
      const { error: insErr } = await supabase.from("wins_feed").insert({
        user_id: userId,
        listing_id: c.opt.listing_id,
        attribution_id: c.opt.id,
        kind: "optimization_impact",
        headline: `[${kindTag}] ${headline}`,
        metric_value: c.viewsDelta,
        window_days: c.window.days,
      });
      if (!insErr) inserted++;
      else console.error("[milestone insert]", insErr);
    }
  }

  return { mode: "milestones", processed: approved.length, inserted };
}
