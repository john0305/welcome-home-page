// Pluggable data-integration contract (Section 10).
//
// Adding a new provider = implement DataIntegration + register it in
// INTEGRATIONS below. The generic edge functions (integration-oauth,
// sync-integration-data) dispatch by provider key — no per-provider endpoints.
// Tokens follow the etsy_tokens pattern: server-side only, never returned to
// the client. Each provider's metrics feed the SAME insight pipeline
// (fix_actions / integration_metrics), never a separate silo.

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // seconds
}

export interface MetricsResult {
  /** Normalized daily metrics, keyed by ISO date. */
  daily: Record<string, Record<string, number>>;
  /** Provider-level context worth persisting (property name, etc.). */
  metadata?: Record<string, unknown>;
}

export interface InsightCandidate {
  factor_key: string;
  severity: "low" | "medium" | "high";
  rationale: string;
  evidence: Record<string, unknown>;
}

export interface DataIntegration {
  provider: string;
  displayName: string;
  /** OAuth scopes requested on connect. */
  scopes: string[];
  buildAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  /**
   * Pull the last `days` of metrics. `externalAccountId` is the provider-side
   * account/property; when absent the connector should discover and return it
   * via metadata (first sync).
   */
  fetchMetrics(accessToken: string, externalAccountId: string | null, days: number): Promise<MetricsResult>;
  /** Turn normalized metrics into zero or more insight-pipeline candidates. */
  mapToInsights(daily: MetricsResult["daily"]): InsightCandidate[];
}

// ─── Google Analytics 4 ───────────────────────────────────────────────────────

const GA_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GA_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const GA_DATA_API = "https://analyticsdata.googleapis.com/v1beta";

function gaClientId(): string {
  return Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
}
function gaClientSecret(): string {
  return Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
}

const GoogleAnalytics: DataIntegration = {
  provider: "google_analytics",
  displayName: "Google Analytics",
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],

  buildAuthUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: gaClientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      access_type: "offline", // refresh token
      prompt: "consent",
      state,
    });
    return `${GA_AUTH_URL}?${p.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const r = await fetch(GA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: gaClientId(),
        client_secret: gaClientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!r.ok) throw new Error(`Google token exchange failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return await r.json() as TokenSet;
  },

  async refreshToken(refreshToken) {
    const r = await fetch(GA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: gaClientId(),
        client_secret: gaClientSecret(),
        grant_type: "refresh_token",
      }),
    });
    if (!r.ok) throw new Error(`Google token refresh failed: ${r.status}`);
    const json = await r.json() as TokenSet;
    // Google refresh responses omit the refresh token — keep using the old one.
    return { ...json, refresh_token: json.refresh_token ?? refreshToken };
  },

  async fetchMetrics(accessToken, externalAccountId, days) {
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // Discover the first GA4 property when none is stored yet.
    let property = externalAccountId;
    let metadata: Record<string, unknown> | undefined;
    if (!property) {
      const r = await fetch(`${GA_ADMIN_API}/accountSummaries`, { headers });
      if (!r.ok) throw new Error(`GA account discovery failed: ${r.status}`);
      const json = await r.json() as {
        accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[];
      };
      const firstProp = json.accountSummaries?.flatMap((a) => a.propertySummaries ?? [])[0];
      if (!firstProp) throw new Error("No GA4 property found on this Google account");
      property = firstProp.property; // "properties/123456"
      metadata = { property_display_name: firstProp.displayName };
    }

    const r = await fetch(`${GA_DATA_API}/${property}:runReport`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "conversions" }],
      }),
    });
    if (!r.ok) throw new Error(`GA runReport failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const report = await r.json() as {
      rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
    };

    const daily: MetricsResult["daily"] = {};
    for (const row of report.rows ?? []) {
      const rawDate = row.dimensionValues[0]?.value ?? ""; // YYYYMMDD
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const source = (row.dimensionValues[1]?.value ?? "other").toLowerCase();
      const sessions = Number(row.metricValues[0]?.value ?? 0);
      const engaged = Number(row.metricValues[1]?.value ?? 0);
      const conversions = Number(row.metricValues[2]?.value ?? 0);
      const d = daily[date] ?? {};
      d.sessions = (d.sessions ?? 0) + sessions;
      d.engaged_sessions = (d.engaged_sessions ?? 0) + engaged;
      d.conversions = (d.conversions ?? 0) + conversions;
      if (source.includes("etsy")) d.etsy_sessions = (d.etsy_sessions ?? 0) + sessions;
      if (["pinterest", "instagram", "facebook", "tiktok"].some((s) => source.includes(s))) {
        d.social_sessions = (d.social_sessions ?? 0) + sessions;
      }
      daily[date] = d;
    }
    return { daily, metadata: metadata ? { ...metadata, property } : { property } };
  },

  mapToInsights(daily) {
    const dates = Object.keys(daily).sort();
    if (dates.length < 14) return [];
    const half = Math.floor(dates.length / 2);
    const sum = (ds: string[], key: string) => ds.reduce((s, d) => s + (daily[d][key] ?? 0), 0);
    const priorSocial = sum(dates.slice(0, half), "social_sessions");
    const recentSocial = sum(dates.slice(half), "social_sessions");
    const out: InsightCandidate[] = [];

    // Social referral spike → suggest riding the wave (own site data, fully compliant).
    if (priorSocial >= 5 && recentSocial > priorSocial * 1.5) {
      out.push({
        factor_key: "external_traffic_signal",
        severity: "medium",
        rationale: `Your site's social traffic jumped from ${priorSocial} to ${recentSocial} sessions over the last two weeks. Something you posted is landing — worth linking your freshest listings while the wave is rolling.`,
        evidence: { prior_social: priorSocial, recent_social: recentSocial, data_source: "google_analytics" },
      });
    }
    // Social referral collapse → gentle heads-up.
    if (priorSocial >= 20 && recentSocial < priorSocial * 0.4) {
      out.push({
        factor_key: "external_traffic_signal",
        severity: "medium",
        rationale: `Social traffic to your site slowed from ${priorSocial} to ${recentSocial} sessions these past two weeks. A fresh pin or post pointing at a strong listing usually restarts the flow.`,
        evidence: { prior_social: priorSocial, recent_social: recentSocial, data_source: "google_analytics" },
      });
    }
    return out;
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const INTEGRATIONS: Record<string, DataIntegration> = {
  [GoogleAnalytics.provider]: GoogleAnalytics,
};

export function getIntegration(provider: string): DataIntegration | undefined {
  return INTEGRATIONS[provider];
}
