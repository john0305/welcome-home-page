# Lovable Platform — Project Reference

Last updated: 2026-06-06

This document captures up-to-date platform information for this project so collaborators (and future AI sessions) have a single source of truth.

## Project

- **Lovable Project ID:** `5322140f-4ffc-4c2f-98d6-6e50ee6302ea`
- **Preview URL:** https://id-preview--5322140f-4ffc-4c2f-98d6-6e50ee6302ea.lovable.app
- **Published URL:** https://radariq-app.lovable.app
- **Custom Domains:** https://radariq.app, https://www.radariq.app

## Tech Stack

- React 18 + Vite 5 + TypeScript 5
- Tailwind CSS v3 with semantic HSL tokens (see `src/index.css`, `tailwind.config.ts`)
- shadcn/ui components
- TanStack Query for data fetching/caching
- React Router for routing

Lovable projects are React-only. Angular/Vue/Svelte/Next.js are not supported.

## Backend — Lovable Cloud

This project uses **Lovable Cloud** (managed Supabase). No external Supabase account is required and it cannot be disabled once enabled.

- **Supabase project ref (internal):** `brqkcbdbsciwfmnipzbx`
- **Client:** import from `@/integrations/supabase/client` (never edit this file)
- **Types:** `src/integrations/supabase/types.ts` (auto-generated — never edit)
- **Env vars (auto-managed in `.env`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

### Database conventions
- Every `CREATE TABLE public.<x>` migration must include matching `GRANT` statements (to `authenticated`, optionally `anon`, always `service_role`) **before** enabling RLS and creating policies.
- User roles are stored in a separate `user_roles` table with an `app_role` enum and a `SECURITY DEFINER` `has_role()` function. Never store roles on `profiles`/`users`.
- Use validation triggers (not `CHECK` constraints) for time-based or mutable validations.
- Never modify `auth`, `storage`, `realtime`, `supabase_functions`, or `vault` schemas.

### Realtime
Each hook instance should subscribe to a uniquely-named channel (e.g. suffix with `Math.random().toString(36).slice(2)`) to avoid the `cannot add postgres_changes callbacks after subscribe()` error when the same component renders multiple times.

### Edge Functions
- Live under `supabase/functions/<name>/index.ts` and deploy automatically.
- Function-specific overrides go in `supabase/config.toml`; do not change project-level settings there.

## Lovable AI Gateway

Use the AI Gateway for AI features — no user API keys required. Notable supported models:

- `google/gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-flash-image` (Nano Banana)
- `google/gemini-3.1-pro-preview`, `gemini-3.1-flash-lite-preview`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`
- `openai/gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- `openai/gpt-5.2`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4-pro`, `gpt-5.5`, `gpt-5.5-pro`

## Lovable Email

Transactional + auth email from a custom domain with custom branding. Requires Lovable Cloud.

## Design System Rules

- All colors as HSL semantic tokens in `index.css` + `tailwind.config.ts`.
- Never use raw color classes (`text-white`, `bg-black`) in components — use tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.).
- Ensure both light and dark mode contrast.

## Auth Defaults

- Standard email/password signup + login (never anonymous sign-ins).
- Email confirmation enabled by default (do not auto-confirm unless asked).
- Google OAuth enabled by default for new auth flows.

## Useful Docs

- Lovable docs: https://docs.lovable.dev/
- Cloud: https://docs.lovable.dev/features/cloud
- AI: https://docs.lovable.dev/features/ai
- Email: https://docs.lovable.dev/features/custom-emails
