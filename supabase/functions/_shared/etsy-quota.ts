/**
 * Etsy quota manager + public search client.
 *
 * Every Etsy API read call goes through `searchEtsy()`. Every write call
 * goes through the existing `etsyApiFor()` in action-engine.ts. Both log
 * to `api_quota_log` so the admin dashboard can see real-time usage.
 *
 * Settings are read once per function cold start from `platform_settings`.
 * The manager never throws — on quota exceeded it returns { quota_exceeded: true }.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ETSY_BASE = "https://openapi.etsy.com/v3/application";

export interface EtsyListing {
  listing_id: number | string;
  shop_id: number | string;
  shop_name?: string;
  title: string;
  tags: string[];
  price?: { amount: number; divisor: number; currency_code: string };
  num_favorers?: number;
  quantity?: number;
  images?: Array<{ url_570xN?: string }>;
  description?: string;
  creation_timestamp?: number;
  rank_position?: number;
}

export interface SearchResult {
  listings: EtsyListing[];
  quota_exceeded?: boolean;
  from_cache?: boolean;
  error?: string;
}

interface QuotaSettings {
  daily_limit: number;
  hourly_limit: number;
}

async function getQuotaSettings(supabase: SupabaseClient): Promise<QuotaSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["daily_quota_ceiling", "hourly_burst_limit"]);

  const settings: QuotaSettings = { daily_limit: 9000, hourly_limit: 800 };
  if (data) {
    for (const row of data) {
      if (row.key === "daily_quota_ceiling") settings.daily_limit = Number(row.value) || 9000;
      if (row.key === "hourly_burst_limit") settings.hourly_limit = Number(row.value) || 800;
    }
  }
  return settings;
}

export async function checkQuota(supabase: SupabaseClient): Promise<{
  ok: boolean;
  daily_used: number;
  hourly_used: number;
  reason?: string;
}> {
  const settings = await getQuotaSettings(supabase);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfHour = new Date(now);
  startOfHour.setUTCMinutes(0, 0, 0);

  const [{ count: dailyCount }, { count: hourlyCount }] = await Promise.all([
    supabase.from("api_quota_log").select("*", { count: "exact", head: true })
      .gte("called_at", startOfDay.toISOString()),
    supabase.from("api_quota_log").select("*", { count: "exact", head: true })
      .gte("called_at", startOfHour.toISOString()),
  ]);

  const daily_used = dailyCount ?? 0;
  const hourly_used = hourlyCount ?? 0;

  if (daily_used >= settings.daily_limit) {
    return { ok: false, daily_used, hourly_used, reason: "daily_limit_reached" };
  }
  if (hourly_used >= settings.hourly_limit) {
    return { ok: false, daily_used, hourly_used, reason: "hourly_limit_reached" };
  }
  return { ok: true, daily_used, hourly_used };
}

async function logApiCall(
  supabase: SupabaseClient,
  opts: { endpoint: string; call_type: "read" | "write"; user_id?: string | null; priority?: number; success?: boolean },
): Promise<void> {
  try {
    await supabase.from("api_quota_log").insert({
      endpoint: opts.endpoint,
      call_type: opts.call_type,
      user_id: opts.user_id ?? null,
      priority: opts.priority ?? 5,
      success: opts.success ?? true,
    });
  } catch {
    // Non-fatal — quota log failure should not block the pipeline.
  }
}

/**
 * Search Etsy for active listings matching a keyword query.
 * Uses the public search endpoint — only requires x-api-key, no user OAuth.
 * Respects quota limits and logs every call.
 */
export async function searchEtsy(
  supabase: SupabaseClient,
  query: string,
  opts: {
    limit?: number;
    user_id?: string | null;
    priority?: number;
    /** On 429 or hourly limit: wait this many ms then retry once. Default 60s. */
    retryDelayMs?: number;
  } = {},
): Promise<SearchResult> {
  const apiKey = Deno.env.get("ETSY_API_KEY");
  const sharedSecret = Deno.env.get("ETSY_SHARED_SECRET");
  if (!apiKey) {
    return { listings: [], error: "ETSY_API_KEY not configured" };
  }
  if (!sharedSecret) {
    // Etsy requires `keystring:shared_secret` in x-api-key as of Feb 9, 2026.
    return { listings: [], error: "ETSY_SHARED_SECRET not configured" };
  }
  const apiKeyHeader = `${apiKey}:${sharedSecret}`;

  const quota = await checkQuota(supabase);
  if (!quota.ok) {
    console.warn(`[etsy-quota] Quota exceeded: ${quota.reason}`);
    return { listings: [], quota_exceeded: true };
  }

  const limit = Math.min(opts.limit ?? 15, 25);
  const endpoint = `/listings/active?keywords=${encodeURIComponent(query)}&limit=${limit}&sort_on=score&sort_order=desc&includes=images`;

  const doFetch = async (): Promise<Response> =>
    fetch(`${ETSY_BASE}${endpoint}`, {
      headers: {
        "x-api-key": apiKeyHeader,
        "Accept": "application/json",
      },
    });

  let res = await doFetch();

  if (res.status === 429) {
    const delay = opts.retryDelayMs ?? 60_000;
    console.warn(`[etsy-quota] 429 rate limit — waiting ${delay}ms then retrying`);
    await new Promise((r) => setTimeout(r, delay));
    res = await doFetch();
  }

  const success = res.ok;
  await logApiCall(supabase, {
    endpoint: "listings/active",
    call_type: "read",
    user_id: opts.user_id,
    priority: opts.priority,
    success,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { listings: [], error: `Etsy ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json().catch(() => null);
  const results: EtsyListing[] = (data?.results ?? []).map((l: Record<string, unknown>, idx: number) => ({
    listing_id: l.listing_id,
    shop_id: l.shop_id,
    title: String(l.title ?? ""),
    tags: Array.isArray(l.tags) ? l.tags.map(String) : [],
    price: l.price as EtsyListing["price"],
    num_favorers: Number(l.num_favorers ?? 0),
    quantity: Number(l.quantity ?? 0),
    images: Array.isArray(l.images) ? l.images as EtsyListing["images"] : [],
    description: String(l.description ?? ""),
    creation_timestamp: Number(l.creation_tsz ?? 0),
    rank_position: idx + 1,
  }));

  return { listings: results };
}

/**
 * Log a write call to the quota tracker (for use by apply-fix-action and related writers).
 * Does NOT perform any rate limiting — write calls are user-initiated and already
 * guarded by the action engine. We just log them for admin visibility.
 */
export async function logWriteCall(
  supabase: SupabaseClient,
  opts: { endpoint: string; user_id?: string | null; success?: boolean },
): Promise<void> {
  await logApiCall(supabase, {
    endpoint: opts.endpoint,
    call_type: "write",
    user_id: opts.user_id,
    success: opts.success ?? true,
  });
}
