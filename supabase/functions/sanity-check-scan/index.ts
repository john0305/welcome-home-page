/**
 * sanity-check-scan
 *
 * Scans a user's listings for obvious mistakes and writes rows to
 * public.listing_sanity_flags. Flag-only — never edits listing content.
 *
 * Auth:
 *   - User JWT  (manual "Run sanity check" button) — scans only that user's shop
 *   - Service role + x-cron-trigger (nightly job) — scans all users or body.user_id
 *
 * Input (POST JSON):
 *   {
 *     scope: 'all' | 'changed' | 'listing_ids',
 *     user_id?: uuid,             // required when called with service role
 *     listing_ids?: uuid[],       // when scope === 'listing_ids'
 *   }
 *
 *   scope='listing_ids' is reserved for a future "user edits a listing in
 *   RadarIQ → immediate re-scan" trigger. Not yet wired to any caller.
 *
 * Re-scan semantics:
 *   - Each detected issue produces a stable `match_key` (computed in SQL from
 *     flag_type + field + normalized(match_value)). Upserts by
 *     (internal_listing_id, match_key) — never duplicates.
 *   - Any previously-`active` flag for a listing whose match_key is NOT
 *     produced this run flips to `status='resolved'` (user fixed it).
 *   - `ignored_permanently` rows are left untouched — they never re-surface
 *     even on a forced rescan.
 *
 * Future enhancement: image-vs-text mismatch via vision analysis (separate
 * feature — out of scope for this check).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-trigger",
};

type FlagType = "placeholder" | "profanity" | "internal_note" | "price_outlier" | "text_mismatch";
type Field = "title" | "description" | "tags" | "price";

interface PendingFlag {
  flag_type: FlagType;
  field: Field;
  match_value: string;
  flagged_text: string;
  detail: string;
}

interface ListingRow {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  price: number | null;
  niche: string | null;
  state: string | null;
}

const MAX_TEXT_SCAN_CHARS = 2200;

// ────────────────────── detectors ──────────────────────

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[[^\]]{1,80}\]/g, // [Insert Name Here]
  /\{\{[^}]{1,80}\}\}/g, // {{handlebars}}
  /<[A-Z][^<>]{1,80}>/g, // <PRODUCT NAME> — uppercase-leading to avoid matching real HTML
];
const PLACEHOLDER_PHRASES = [
  "insert name here", "insert here", "lorem ipsum", "your text here",
  "product name", "placeholder", "tbd", "todo",
];
const REPEATED_RUN = /([A-Za-z])\1{4,}/g; // xxxxxx
const REPEATED_WORD = /\b(\w+)(\s+\1){2,}\b/gi; // foo foo foo

function detectPlaceholders(text: string, field: Field): PendingFlag[] {
  const out: PendingFlag[] = [];
  for (const re of PLACEHOLDER_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      out.push(makeFlag("placeholder", field, m[0], text, m.index ?? 0,
        "Looks like template placeholder text — review before it goes live."));
    }
  }
  const lower = text.toLowerCase();
  for (const phrase of PLACEHOLDER_PHRASES) {
    let idx = 0;
    while ((idx = lower.indexOf(phrase, idx)) !== -1) {
      out.push(makeFlag("placeholder", field, text.slice(idx, idx + phrase.length), text, idx,
        "Looks like template placeholder text — review before it goes live."));
      idx += phrase.length;
    }
  }
  for (const re of [REPEATED_RUN, REPEATED_WORD]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      out.push(makeFlag("placeholder", field, m[0], text, m.index ?? 0,
        "Repeated filler text — looks unintentional."));
    }
  }
  return out;
}

function detectProfanity(text: string, field: Field): PendingFlag[] {
  const out: PendingFlag[] = [];
  const profane = /\b(fuck|fucking|shit|bullshit|asshole|bitch|bastard|dick|damn|crap)\b/gi;
  for (const match of text.matchAll(profane)) {
    const word = match[0];
    if (word) {
      const idx = match.index ?? 0;
      out.push(makeFlag("profanity", field, word, text, Math.max(idx, 0),
        "This text might not be what you intended — review before it goes live."));
    }
  }
  return out;
}

const INTERNAL_NOTE_PHRASES = [
  /\btodo\b/i, /\bremember to\b/i, /\bfix this\b/i, /\bupdate price\b/i,
  /@reminder\b/i, /\bnote to self\b/i, /\bdraft\b/i, /\bwip\b/i, /\bwork in progress\b/i,
];
function detectInternalNotes(text: string, field: Field): PendingFlag[] {
  const out: PendingFlag[] = [];
  for (const re of INTERNAL_NOTE_PHRASES) {
    const m = re.exec(text);
    if (m) {
      out.push(makeFlag("internal_note", field, m[0], text, m.index,
        "Quick check: this might be unintentional — looks like an internal note."));
    }
  }
  return out;
}

function detectPriceOutlier(listing: ListingRow, stats: { mean: number; count: number }): PendingFlag[] {
  if (listing.price == null) return [];
  // Primary catch-all: any price < $1.00 is almost certainly a placeholder draft.
  if (listing.price < 1) {
    return [{
      flag_type: "price_outlier",
      field: "price",
      match_value: listing.price.toFixed(2),
      flagged_text: `$${listing.price.toFixed(2)}`,
      detail: `Price ($${listing.price.toFixed(2)}) is below $1 — looks like a placeholder.`,
    }];
  }
  // Secondary statistical heuristic: relative + absolute cheap, only when shop
  // has enough listings to define a meaningful average.
  // TODO: revisit threshold after first batch of real scan results.
  if (stats.count >= 10 && listing.price < 5 && listing.price <= Math.max(2, stats.mean * 0.05)) {
    return [{
      flag_type: "price_outlier",
      field: "price",
      match_value: listing.price.toFixed(2),
      flagged_text: `$${listing.price.toFixed(2)}`,
      detail: `Price ($${listing.price.toFixed(2)}) is far below your shop average ($${stats.mean.toFixed(2)}) — may be a placeholder.`,
    }];
  }
  return [];
}

// Experimental — text_mismatch. Limited to jewelry categories present in the
// user's catalog. False-positive rate is higher than the other checks; UI
// labels these as "Possible mismatch — please verify".
const CATEGORY_NOUNS: Record<string, { expected: string[]; conflicting: string[] }> = {
  necklaces: { expected: ["necklace", "pendant", "chain", "choker"], conflicting: ["bracelet", "ring", "earring", "earrings", "brooch", "anklet"] },
  bracelets: { expected: ["bracelet", "bangle", "cuff"],              conflicting: ["necklace", "ring", "earring", "earrings", "brooch", "anklet"] },
  earrings:  { expected: ["earring", "earrings", "stud", "hoop"],     conflicting: ["necklace", "bracelet", "ring", "brooch", "anklet"] },
  rings:     { expected: ["ring", "band"],                            conflicting: ["necklace", "bracelet", "earring", "earrings", "brooch", "anklet"] },
  brooches:  { expected: ["brooch", "pin"],                           conflicting: ["necklace", "bracelet", "ring", "earring", "earrings", "anklet"] },
  pendants:  { expected: ["pendant", "charm"],                        conflicting: ["bracelet", "ring", "earring", "earrings", "brooch", "anklet"] },
};

function detectTextMismatch(listing: ListingRow): PendingFlag[] {
  if (!listing.description) return [];
  const categorySignals = [listing.niche, listing.title, ...(listing.tags ?? [])]
    .filter(Boolean)
    .map((p) => String(p).toLowerCase());
  let bucket: { expected: string[]; conflicting: string[] } | null = null;
  let matchedCategory = "";
  for (const key of Object.keys(CATEGORY_NOUNS)) {
    if (categorySignals.some((p) => p.includes(key.slice(0, -1)))) { bucket = CATEGORY_NOUNS[key]; matchedCategory = key; break; }
  }
  if (!bucket) return [];
  const desc = listing.description;
  const lower = desc.toLowerCase();
  const firstSentence = lower.slice(0, Math.min(lower.length, lower.indexOf(".") + 1 || 160));
  const out: PendingFlag[] = [];
  for (const noun of bucket.conflicting) {
    const re = new RegExp(`\\b${noun}\\b`, "gi");
    const matches = [...lower.matchAll(re)];
    const prominent = matches.length >= 2 || firstSentence.match(re);
    if (prominent && matches.length > 0) {
      const idx = (matches[0].index ?? 0);
      out.push(makeFlag("text_mismatch", "description", desc.slice(idx, idx + noun.length), desc, idx,
        `Description mentions "${noun}" — this listing appears to be a ${matchedCategory} item. Possible mismatch — please verify.`));
    }
  }
  return out;
}

// ────────────────────── helpers ──────────────────────

function makeFlag(
  flag_type: FlagType, field: Field, match_value: string,
  full: string, idx: number, detail: string,
): PendingFlag {
  const CTX = 40;
  const start = Math.max(0, idx - CTX);
  const end = Math.min(full.length, idx + match_value.length + CTX);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < full.length ? "…" : "";
  const flagged_text = `${prefix}${full.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
  return { flag_type, field, match_value, flagged_text, detail };
}

function scanListing(listing: ListingRow, stats: { mean: number; count: number }, disabled: Set<string>): PendingFlag[] {
  const out: PendingFlag[] = [];
  const scanText = (text: string | null | undefined, field: Field) => {
    if (!text) return;
    const boundedText = text.length > MAX_TEXT_SCAN_CHARS ? text.slice(0, MAX_TEXT_SCAN_CHARS) : text;
    if (!disabled.has("placeholder"))   out.push(...detectPlaceholders(boundedText, field));
    if (!disabled.has("profanity"))     out.push(...detectProfanity(boundedText, field));
    if (!disabled.has("internal_note")) out.push(...detectInternalNotes(boundedText, field));
  };
  scanText(listing.title, "title");
  scanText(listing.description, "description");
  if (listing.tags?.length) scanText(listing.tags.join(", "), "tags");
  if (!disabled.has("price_outlier")) out.push(...detectPriceOutlier(listing, stats));
  if (!disabled.has("text_mismatch")) out.push(...detectTextMismatch(listing));
  // De-dup within a single listing scan (same match_value + flag_type + field)
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.flag_type}:${f.field}:${f.match_value.toLowerCase().trim()}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ────────────────────── handler ──────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      scope?: "all" | "changed" | "listing_ids";
      user_id?: string;
      listing_ids?: string[];
    };
    const scope = body.scope ?? "all";

    // ── Auth ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isService = token === SERVICE_ROLE
      || (CRON_SECRET && req.headers.get("x-cron-trigger") === CRON_SECRET);

    let userId: string | null = null;
    if (isService) {
      userId = body.user_id ?? null;
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id ?? null;
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ── Resolve target listings ──
    let q = supabase.from("listings").select("id, title, description, tags, price, niche, state, content_updated_at, last_sanity_scanned_at")
      .eq("user_id", userId).eq("state", "active");
    if (scope === "listing_ids" && body.listing_ids?.length) {
      q = q.in("id", body.listing_ids);
    }
    const { data: listingsAll, error: lErr } = await q;
    if (lErr) return json({ error: lErr.message }, 500);
    let listings = (listingsAll ?? []) as Array<ListingRow & { content_updated_at?: string; last_sanity_scanned_at?: string | null }>;

    if (scope === "changed") {
      listings = listings.filter((l) => !l.last_sanity_scanned_at
        || (l.content_updated_at && l.content_updated_at > l.last_sanity_scanned_at));
    }

    // ── Settings ──
    const { data: profile } = await supabase.from("user_profiles")
      .select("sanity_check_disabled_types").eq("id", userId).maybeSingle();
    const disabled = new Set<string>(((profile?.sanity_check_disabled_types as string[] | null) ?? []));

    // ── Shop price stats ──
    const prices = (listingsAll ?? []).map((l) => Number(l.price)).filter((p) => Number.isFinite(p) && p > 0);
    const mean = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const stats = { mean, count: prices.length };

    // ── Ignored permanently — match_keys per listing ──
    const listingIds = listings.map((l) => l.id);
    const { data: ignoredRows } = listingIds.length
      ? await supabase.from("listing_sanity_flags")
        .select("internal_listing_id, match_key")
        .in("internal_listing_id", listingIds)
        .eq("status", "ignored_permanently")
      : { data: [] as Array<{ internal_listing_id: string; match_key: string }> };
    const ignoredKeys = new Set((ignoredRows ?? []).map((r) => `${r.internal_listing_id}:${r.match_key}`));

    // ── Scan ──
    let inserted = 0, resolved = 0, scanned = 0;
    for (const listing of listings) {
      scanned++;
      const flags = scanListing(listing, stats, disabled);

      // Compute match_keys we're about to upsert (sha256 in JS for comparison)
      const enc = new TextEncoder();
      const upsertRows: Array<{
        user_id: string; internal_listing_id: string; flag_type: string; field: string;
        match_value: string; flagged_text: string; detail: string; status: string;
      }> = [];
      const seenKeys = new Set<string>();
      for (const f of flags) {
        const norm = `${f.flag_type}:${f.field}:${f.match_value.toLowerCase().trim()}`;
        const buf = await crypto.subtle.digest("SHA-256", enc.encode(norm));
        const key = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        seenKeys.add(key);
        if (ignoredKeys.has(`${listing.id}:${key}`)) continue; // skip — user said don't bother me
        upsertRows.push({
          user_id: userId, internal_listing_id: listing.id,
          flag_type: f.flag_type, field: f.field, match_value: f.match_value,
          flagged_text: f.flagged_text, detail: f.detail, status: "active",
        });
      }

      if (upsertRows.length) {
        const { error: upErr, count } = await supabase.from("listing_sanity_flags")
          .upsert(upsertRows, { onConflict: "internal_listing_id,match_key", count: "exact" });
        if (upErr) console.error("sanity upsert error", upErr); else inserted += count ?? 0;
      }

      // Resolve any previously-active flags for this listing whose match_key
      // is no longer produced (user fixed the content).
      const { data: existing } = await supabase.from("listing_sanity_flags")
        .select("id, match_key").eq("internal_listing_id", listing.id).eq("status", "active");
      const toResolve = (existing ?? []).filter((r) => !seenKeys.has(r.match_key));
      if (toResolve.length) {
        const { error: rErr } = await supabase.from("listing_sanity_flags")
          .update({ status: "resolved" }).in("id", toResolve.map((r) => r.id));
        if (rErr) console.error("sanity resolve error", rErr); else resolved += toResolve.length;
      }

      await supabase.from("listings").update({ last_sanity_scanned_at: new Date().toISOString() })
        .eq("id", listing.id);
    }

    return json({ ok: true, scanned, inserted, resolved });
  } catch (e) {
    console.error("sanity-check-scan error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
