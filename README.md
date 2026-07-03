# RadarIQ — Etsy Seller Optimization Assistant

AI-powered assistant that grades Etsy listings, recommends specific
improvements, applies safe fixes with the seller's consent, and tracks
results — using only the seller's own shop data, accessed through Etsy's
official API.

**The full, current system map lives in [ARCHITECTURE.md](ARCHITECTURE.md)** —
read that first. This README is just orientation and local-dev setup.

## Stack (current)

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript, Tailwind + Radix (shadcn) |
| Backend | Supabase (Lovable Cloud): Postgres + RLS, Deno edge functions, pg_cron |
| Auth | Supabase Auth (Lovable Cloud), social OAuth via `@lovable.dev/cloud-auth-js` |
| AI | Lovable AI Gateway (Gemini 2.5 Flash primary) |
| Etsy | Etsy Open API v3 (OAuth 2.0 + PKCE; tokens server-side only) |
| Billing | Stripe |
| Integrations | Pluggable data connectors (`supabase/functions/_shared/data-integrations.ts`); GA4 shipped |

> Historical note: an earlier architecture (Google Cloud Functions, direct
> Gemini calls, Neo4j Aura) was abandoned; its last remnants were removed in
> the 2026-07 build pass. If you find references to it, they're stale.

## Local development

```bash
npm install
cp .env.example .env   # VITE_ Supabase URL + publishable key (Lovable provides these)
npm run dev            # http://localhost:5173
```

- With no Supabase env values the app runs in mock-auth demo mode (`admin` / `1234`, mock data).
- `npm run build` / `npm run lint` before committing; edge functions live in `supabase/functions/` and are deployed by Lovable.
- Never commit `.env` — only `.env.example` belongs in git. Secrets used by edge functions (Etsy keys, `LOVABLE_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `CRON_SECRET`, Stripe keys) are managed in Lovable, not in this repo.

## Key documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — living system map: data flow, schema, auth, the 2026-07 build pass, tier map, known issues.
- [documents/etsy_compliance_trend_design.md](documents/etsy_compliance_trend_design.md) — Etsy API ToS constraints; **read before touching market/competitor features**.
- [documents/etsy_api_data_audit.md](documents/etsy_api_data_audit.md) — what Etsy data is used vs. deferred.
