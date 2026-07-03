# RadarIQ — Platform Redesign & Intelligence Overhaul
### Brief for Claude Fable 5

> **How to read this document**: sections below are grouped by *topic*, not by build order. Read Section 15 ("Suggested Build Sequence") first to know what order to actually execute in — several sections depend on earlier ones being finished (e.g. Section 3's photo work depends on Section 9's type detection; almost everything depends on Section 2's pipeline/security fixes being solid first). Section numbers are stable reference IDs used for cross-links throughout — follow Section 15 for execution order, not the numbering.

## 1. Positioning & Vision

RadarIQ is an Etsy-focused seller optimization *assistant* — not a spreadsheet-style dashboard, but something that feels alive and proactive. **Scope for this pass is Etsy only.** Do not build a multi-platform module architecture now — keep the design clean enough that it *could* extend later, but don't spend effort abstracting for platforms that don't exist yet. Focus all depth on making the Etsy experience excellent.

**Current stack (confirmed via architecture audit)**: React 18 + Vite + TypeScript frontend; Supabase (Lovable Cloud) backend — Postgres, RLS, Deno edge functions, pg_cron; Etsy Open API v3; Lovable AI Gateway (Gemini 2.5 Flash) powering grading, fix generation, Echo chat, and listing rewrites; Stripe for billing. The platform is near-complete functionally — this pass is about auditing/fixing what exists, filling real gaps, and redesigning the experience to match the plan below, not a rebuild from scratch. Where a feature already exists (see notes throughout), audit and extend it rather than building a parallel version.

**Core identity**: RadarIQ should feel like an extension of the seller's own store — not third-party software they're renting, and not a tool pushing its own brand. Visually and tonally, it adapts to *them*.

**Explicitly flag, don't assume**: identify seller segments where RadarIQ's current value prop is weak (e.g. print-on-demand/dropship sellers with no real photo control, digital-download-only shops, very low-volume/hobby sellers) and note this honestly rather than force-fitting them.

**Current user base**: the platform currently has one real beta tester, an admin account, and a few dummy/test accounts. There is no meaningful existing-user migration problem to solve right now — don't spend effort on migration tooling or gradual rollout infrastructure for this pass. Build for the redesigned experience directly; real-user rollout planning can happen once there's an actual user base large enough to warrant it.

**Living architecture document**: maintain a running architecture/reference document throughout the build — not written once at the end, but created early and appended to as work progresses. It should capture what exists, where it lives, why it was built that way, and what's been completed vs. still in progress. This is for future debugging and onboarding (including future Claude Code sessions working on this codebase), so it needs to stay accurate as the build evolves, not be a retrospective summary. Save it as a dedicated markdown file (e.g. `ARCHITECTURE.md` or similar) in the repo root, separate from any existing `CLAUDE.md` — reference it from `CLAUDE.md` if one exists, rather than merging the two. Update it as each major piece (pipeline fixes, new features, integrations) is completed, not just at the end of the run.

---

## 2. Analytics & Intelligence — Audit and Fix

Trace the full pipeline end-to-end and fix breaks or drift found anywhere in it:

`nightly sync → grading → action engine → seller-facing recommendation`

**Named security/stability findings to fix as part of this pass (from the current architecture audit — treat as confirmed, not speculative):**
- 🔴 **`.env` was committed to git history** with a live Supabase URL/anon key and Stripe publishable key. *Credential rotation/history scrub is being handled separately, outside this build — Fable doesn't need to act on this specific item.* Do ensure no new secrets get committed during this build, and that `.gitignore` correctly excludes `.env` going forward.
- 🔴 **Most edge functions run with `verify_jwt = false`**, relying on internal auth checks that aren't uniformly present across all functions. Audit every edge function for consistent auth enforcement.
- 🟠 **`AppContext.tsx` (`loadConnectedStore`) was pulling Etsy `access_token`/`refresh_token` into client state.** Tokens should never leave the server. Re-verify against the current file and fix if still present.
- 🟠 **Admin "log in as user" (impersonation) likely the root cause of the above**: redesign this properly rather than patching around it. Impersonation should issue a scoped, time-limited session that lets the UI query the target user's data, while all actual Etsy API calls continue to happen server-side using tokens that never reach the browser — impersonating admin or not. Add an audit log (who impersonated whom, when) and a persistent "viewing as [user]" indicator in the UI so it's never ambiguous which account is active.
- 🟠 **Unverified cron triggers** for `sync-all-stores`, `decay-grades`, `scheduled-optimization` — confirm what actually invokes them; currently undocumented in migrations.
- 🟠 **`AppContext.tsx` is a sprawling, mixed-concern data layer** despite `@tanstack/react-query` already being installed — refactor to use it consistently rather than the current pattern.
- Performance concerns flagged for shops with 500+ listings — investigate and address.
- The legacy `functions/` directory (old Google Cloud Functions code) appears dead but is unconfirmed — verify nothing still deploys from it before removing.
- The root `README.md` describes a stale, abandoned architecture (Google Cloud Functions, Neo4j Aura, GA4 Data API) that no longer matches reality — rewrite it to reflect the current Supabase/edge-function implementation or clearly mark it historical.

Specifically also review:
- Market intelligence layer: data collection reliability, tier-gating logic, smart refresh tiers
- Whether `fix_actions` is still the actual single source of truth, or logic has drifted elsewhere
- Every seller-facing recommendation should be traceable back to fresh, real data — flag any that aren't
- Renewal tracker: upgrade from "renew now" to "renew now vs. wait N days for seasonal/trend lift," using trend data as an input
- Pinterest Spotlight (`pinterest_posts`): confirm it's still functioning correctly and integrate its output into the same insight pipeline as everything else, not as a separate feature silo
- Photo intelligence (Section 3): the closest existing foundation is `analyze-photos` + `photo_analyses` + the photo-grading branch in `grade-listing`, currently narrow (count/presence signals). Extend this into the full retake/reorder/benchmarking system in Section 3 — don't build a parallel photo system.

**Named UI/data bugs found via direct screenshot review of the live app — confirmed, not speculative:**
- 🔴 **"Radar" vs "Echo" naming collision**: the Dashboard's proactive-insight box is currently labeled "RADAR'S INSIGHT" while a separate section on the same screen is labeled "Echo Picks" — two different assistant names shipped on the same page. Resolve this as part of the Echo/mascot reconciliation in Section 13 — pick one identity and apply it consistently everywhere, including this existing "Radar's Insight" box, which is a good foundation to evolve rather than discard.
- 🔴 **Contradictory data between screens**: the Intelligence tab shows "No pending actions — your shop is in great shape" while the Dashboard simultaneously shows "196 listings need attention" for the same shop at the same time. Find and fix the underlying query/state mismatch — this is exactly the kind of "every recommendation traceable to fresh, real data" failure called out above.
- 🟠 **Redundant Store Health Score**: the Dashboard currently displays the same health score in three separate places (top-right widget, large center circle, and a text restatement), and the Priority Actions list is duplicated near-verbatim under a second "Your path forward" section. Consolidate — this is exactly the information-density problem Section 12 asks to avoid.
- 🟠 **Duplicate entry bug**: the Performance page's "Wins" list shows the identical listing title twice in a row ("Vintage Ceramic Sleeping Baby Boy Music Box...") — check for a dedup bug in whatever populates that list.
- 🟠 **Grading tone works against the brief's own tone requirement**: current grade/score displays use blunt letter grades (F, D) and red/orange "Poor"/"Fair" labels throughout (Fix Actions, Intelligence, Dashboard). This directly conflicts with Section 7a's "encouraging, never scolding" requirement — redesign how low scores are presented so a seller with a D-grade shop feels motivated, not judged, while the information stays honest and accurate.
- Confirm whether photo fixes (Fix Actions → Media tab) genuinely require redirecting the seller to Etsy to apply, or whether the Etsy API actually supports image upload/reorder and the current implementation just isn't using it — this affects whether Section 11's "act directly from the insight" requirement is achievable for photos specifically or needs an documented exception.

**Tier alignment**: the platform already has tier/quota infrastructure (`monthly_usage`, `personal_daily_quotas`, `tier-access.ts`) and three tiers (Free, Pro $14/mo, Growth $39/mo). Rather than assigning tiers feature-by-feature as you build, do a **holistic tier-gating pass at the end**, once all features in this brief are built, using the existing tier-access system as the foundation. Review the complete feature set together and decide gating with two goals held simultaneously, not traded off against each other:
- **Genuine value at every tier**: Free should be genuinely useful on its own, not crippled to force upgrades — a seller on Free should feel helped, not teased.
- **Real conversion incentive**: Pro and Growth should offer a clear, honest step up (more depth, more frequency, more integrations, more proactive behavior) that a seller would *want* to pay for because it's genuinely better, not because Free was made deliberately annoying or withheld unfairly.

Explicitly avoid dark-pattern gating (e.g. showing an insight exists but hiding what it is behind a paywall, or artificially throttling something cheap to run in order to manufacture urgency). The test: if a seller on Free feels respected and a seller who upgrades feels the upgrade was worth it, the gating is right.

Document the final tier assignment and reasoning for every feature in the architecture document (see below), so it's easy to review and adjust later.

---

## 3. Photo Intelligence

**Build order note**: this section's recommendations must branch by seller/listing type (Section 9) — a made-to-order seller with no physical item yet needs fundamentally different photo guidance than a physical-inventory seller. Don't build this as type-agnostic and retrofit branching later; confirm Section 9's detection is in place first (see Section 15 for sequencing).

Break "analyze photos" into distinct, actionable outputs:

- **Retake vs. edit classification**: bad lighting/blur/clutter → recommend retake; decent shot with fixable crop/color/composition → recommend edit, with specific guidance
- **Reorder recommendation**: score each photo on conversion-relevant factors (clarity, product-fill-of-frame, context, lighting) and explicitly tell the seller which position to swap, not just which photo is "bad"
- **Competitive photo benchmarking**: compare against category norms (e.g. "top sellers in your category average X% product-fill in lead photo — here's your gap") rather than generic photography advice
- **Explainability required**: every recommendation states *why* in plain language, not just a score

---

## 4. Trend Detection — Compliance-First

Before any design work here, **research current Etsy API Terms of Service and seller-data policies** and design trend detection to only use permitted data sources (the seller's own opted-in data, official API-exposed aggregate/category trends — not scraped competitor listings). This is a hard checkpoint, not an assumption — RadarIQ's Etsy API access is currently under appeal, and getting this wrong risks that further.

Within compliant bounds:
- **Trend-to-listing matching**: when a category trend rises, surface which of the seller's *existing* listings could benefit from a small tweak (title/tag), rather than requiring a new listing
- **Early-warning on decline**: catch drift before it shows up in sales — declining view-to-favorite ratio, search rank slipping, photo staleness relative to refreshed competitors
- **"Why they're winning" pattern analysis**: for an underperforming listing, surface what comparable top performers in the same niche do differently (title structure, tag mix, price positioning), framed as aggregate pattern — never a specific competitor callout

**Investigate the API appeal rejection cause**: during Etsy's review, the reviewer reported seeing a black/blank page when loading the platform — likely a server-side rendering, client-side-only JS, or environment/auth issue specific to however their review process loads the site (possibly no real user session, a headless browser, or a screenshot tool that doesn't execute JS the way a normal browser does). Diagnose and fix this specifically — check whether the app requires a logged-in session to render anything, whether critical content depends on client-side JS with no server-rendered fallback, and whether there's a public/demo view a reviewer could load without authentication. This is likely blocking API approval independent of any policy issue, and should be fixed and verified before or alongside resubmitting the appeal.

---

## 5. Proactive Assistant Behavior

This is a core differentiator, not a bolt-on notification feature.

- **On login**: a short "here's what changed" card — 1-3 things worth attention today, not a full dashboard dump
- **In-session, contextual nudges**: while editing a listing, surface relevant insight right there (e.g. "this photo scored similarly to one that underperformed last month") — inline, not an interrupting popup
- **Notification → conversation → reveal pattern**: a message like "I noticed something about your top listing" → seller taps → plain-language explanation → link to full breakdown
- **Priority gating is mandatory**: build a server-side priority/confidence scoring system so notifications only fire for high-confidence, high-impact findings. Everything else surfaces quietly in-dashboard on next visit, never as a push. This is the single biggest risk to the whole pattern — if it fires often on low-value findings, sellers tune it out fast.
- **"Automatic" means self-scheduling and self-filtering** — it runs and decides what's worth surfacing on its own — not "notify on every check."

---

## 6. Predictive Refresh & Theme Adaptation

**Predictive login timing**: this applies to *when insights are recomputed and surfaced to the seller* — not the underlying Etsy data sync itself. The existing nightly Etsy data pull (`sync-all-stores` / `sync-listings`, Section 2) should keep running on its regular, reliable schedule regardless of prediction accuracy — that's the safety net. On top of that reliable data foundation, predict each seller's likely next login window (behavior/time-series problem) and time *insight recomputation/surfacing* to land just before, so the dashboard feels current rather than stale on open. If prediction is wrong or unavailable for a seller, insights simply refresh on the existing schedule — never leave a seller with no data because a prediction missed.

**Event-driven refresh (complementary, not a replacement)**: also trigger re-checks on meaningful events — a listing edit, a new review, a competitor/category trend shift, a renewal window opening — so the assistant isn't only reacting to predicted logins.

**Confidence decay**: insights have a shelf life. If underlying data passes a staleness threshold (e.g. 5+ days), silently re-verify before ever surfacing it, so nothing shown to the seller is based on stale confidence.

**Theme-adaptive UI**: detect store aesthetic from existing photos, listing copy, and brand voice — the `store_personalization` table already stores seller-provided brand voice/context used to steer AI prompts; use this as a direct input rather than re-deriving brand signal from scratch. Adapt UI *skin* to match (accent colors, imagery style, tone of insight copy). Scope as skin-deep adaptation only (visual chrome), not deep personalization of logic — keep it predictable.

**Drift detection**: periodically (not every login) check whether a store's aesthetic/direction has shifted and re-adapt gradually. Give sellers a manual lock/override option so auto-adaptation never overrides deliberate seller choice without consent.

**Cross-platform version**: once other modules exist, find the aesthetic "sweet spot" across a seller's stores on different platforms rather than treating each in isolation.

---

## 7. UI/UX

Two explicit modes, not one screen trying to serve both:
- **Default view**: 3-5 prioritized actions, plain language, zero jargon — usable by the least technical seller
- **Advanced/expert view (toggle)**: raw scores, full breakdowns, market intelligence detail, for power sellers

Brand-neutral, adaptive design (see Section 6) — should feel like it belongs to the seller's store, not like RadarIQ's own branding pushing through.

No achievement/gamification system — explicitly out of scope for this pass.

---

## 7a. Visual & Tonal Direction (Explicit Guardrails)

Default AI-tool aesthetics tend toward dark mode, neon accents, glassmorphism, monospace/block lettering, dense data-viz — all of that reads as "techy SaaS dashboard," which is the opposite of this product's identity. RadarIQ should feel **warm, approachable, and handmade-adjacent** — appropriate for people running craft/creative small businesses, not enterprise software.

**Design system note**: use Material Design 3 and Google Stitch conventions for their *structural* strengths — component behavior, elevation/spacing logic, motion principles, accessibility-minded interaction patterns — not for their typical dark, techy visual mood. Apply those structural conventions to the warm palette and friendly tone described below, rather than defaulting to M3's common dark/cool color treatments. Structure and interaction patterns from M3/Stitch; visual mood from this section.

Concrete direction to give Fable:
- Warm, soft color palettes as the default baseline (before theme-adaptation in Section 6 kicks in) — not the default dark-mode/neon SaaS look
- Rounded shapes, soft edges, generous whitespace over dense grids and hard borders
- Friendly, humanized typography — no all-caps block lettering, no monospace-as-decoration, no "futuristic" display fonts
- Illustration/character-forward accents over icon-heavy, data-table-forward layouts — numbers should support the story, not be the story
- Motion should feel alive and gentle (soft transitions, small delightful details) rather than sharp/mechanical snap-ins typical of dashboards
- Explicitly instruct Fable to avoid: cyberpunk/futuristic tropes, aggressive gradients, harsh neon accent colors, generic "AI product" visual clichés (glowing orbs, circuit-board motifs, etc.)

This should feel closer to a friendly, well-designed consumer app than an analytics platform — the seller should feel *helped*, not *monitored*.

**Current baseline, confirmed via screenshots**: the app already uses a light/cream background, not dark mode — good news, less distance to travel than a typical AI-tool redesign. The gap is density, redundancy, and tone: dense stat-card grids, spreadsheet-style list rows, blunt letter grades (F, D) and red/orange "Poor"/"Fair" labels throughout. The direction is de-clutter and warm the tone, not change the fundamental light/dark mode.

**Worked example — rewrite this exact real insight from the current app** as a concrete before/after Fable can calibrate against:
- **Current**: *"Your title is 22 characters. Competitors average 106 characters. A longer, keyword-rich title improves search placement."* — accurate, but flat and slightly clinical.
- **Target direction**: something like *"This title's leaving room on the table — shoppers searching for pieces like yours are seeing much longer, keyword-rich titles from similar shops. Want help expanding it?"* (illustrative, not a literal script to copy) — same information, same honesty, but reads like a helpful observation rather than a spec comparison. Every rewritten insight across the app should hit this same bar: real numbers when they matter, but framed as a helpful nudge, not a scorecard.

Similarly, replace blunt letter-grade language (F, D, "Poor") with framing that stays honest about where a shop stands but doesn't read as a report card — e.g. leading with what's working and what the *next* improvement is, rather than opening with a failing grade.

**Accessibility (WCAG)**: design with WCAG compliance in mind from the start, not retrofitted — sufficient color contrast (especially important given the warm/soft palette direction, which can drift into low-contrast territory if not checked), readable text sizing, keyboard navigability, and screen-reader-sensible markup/labeling throughout.

**Mobile-first, desktop-supported**: design mobile as the primary experience — larger touch targets, readable text sizes without zooming, layouts that work for a seller checking in throughout the day on their phone. Desktop should be a first-class supported experience for sellers who want a full-screen view, especially comfortable for the advanced/expert mode (Section 7) given its higher information density — but the advanced view must still be genuinely usable on mobile, not desktop-exclusive. The design process should start from mobile constraints and expand outward, not the reverse.

**Tone of voice for insight copy**: the personality lives in the writing, not just the visuals. Every piece of copy — insight text, notifications, empty states, error messages — should read like it's coming from something with warmth and a point of view, not a system generating alerts. Concrete guidance for Fable:
- Write like a knowledgeable friend, not a report generator: "Your lead photo might be losing shoppers before they scroll" rather than "Lead photo CTR: -12%"
- Avoid cold data-speak in user-facing copy (CTR, conversion rate, etc. belong in the advanced view, not the default one)
- Encouraging, never scolding, when flagging something negative — the seller should feel supported, not called out
- Keep it concise — warmth doesn't mean wordy; short and human beats short and robotic, but also beats long and friendly

---

## 8. Outcome Tracking & Data Utilization Audit

**Outcome tracking (advice → action → result)**
The platform already has scaffolding for this — `action_effectiveness` and `user_listing_actions` tables exist. Audit how thoroughly they're currently used and extend them rather than building parallel tracking: for every recommendation surfaced, capture what the seller actually did with it, not just a binary "dismissed/accepted." Distinguish: acted on as suggested, acted on differently, ignored, explicitly dismissed (the existing `dismissed_alerts` table is relevant here too — check whether it's already capturing this). Then track downstream metric change (view rate, favorites, conversion, search rank) following action, over a defined window.

This closes the loop for two things already in this brief:
- **Section 5 priority-gating**: recommendation types that consistently get ignored should lose priority over time; types that consistently get acted on and correlate with real improvement should surface with more confidence.
- **Section 13 "learning" signal (future)**: makes "I've gotten better at X" a true, data-backed statement rather than a decorative one.

Also gives you, separately, internal product analytics — which recommendation types are worth continued investment and which aren't landing with sellers.

**Unused API data audit**
Systematically enumerate everything the Etsy API returns versus everything RadarIQ currently ingests and uses. Specifically check for value in:
- Shop-level data not currently used: policies, shipping profiles, shop sections/categories, follower/favoriting trends
- Listing-level fields present but not factored into grading: attributes, variations, processing time, materials, shop section placement
- Review/feedback *text* (not just star ratings) — mine for recurring themes that could feed directly into recommendations
- Historical data available via the API that isn't currently being retained or trended over time even though it could be

Output: a ranked list of currently-unused data points, what each could plausibly inform, and a recommendation on which are worth wiring in now versus later.

---

## 9. Niche & Shop-Type Detection

**This already exists in part** — `resolve-niche` (edge function), `user_niche_profiles`, `seed_niches`, and `useResolveNiche.ts` are live. This section is an audit-and-extend task, not a fresh build: confirm what the current system actually detects and how accurately, then build the gaps described below on top of it.

Detect each seller's niche/shop type automatically (from listings, categories, materials, copy, images) to drive personalization — this feeds theme adaptation (Section 6), relevant benchmarking (Section 3), and which insights are worth surfacing at all for that shop type.

**Detect and adapt to seller/listing type, not just aesthetic**: Etsy sellers operate under meaningfully different models that change what "good" even means. Research and account for the actual categories Etsy supports (this list is a starting point, not exhaustive — have Fable confirm the full set from Etsy's own listing-type taxonomy):
- Made-to-order / print-on-demand (no unique physical photos possible — "retake this photo" advice is meaningless here)
- Digital downloads (no physical product quality issues at all — optimization is about the file/preview, not photography)
- One-of-a-kind / unique items (single inventory — urgency/scarcity framing may matter more than restock/renewal timing)
- Multi-quantity, made-in-batches items (restock timing, seasonal production planning matters)
- Vintage/resale (authenticity, condition disclosure, and sourcing-driven listing patterns differ from handmade)
- Supplies/craft materials (bulk-buyer behavior, different search intent than finished-product buyers)

The insight engine, photo intelligence (Section 3), and recommendations should genuinely branch based on detected type — not just cosmetically relabel the same advice. A made-to-order seller shouldn't be told to "retake this photo" if there's no physical item to photograph yet; a digital-download seller's "photo" insights should be about preview/mockup quality, not lighting/composition in the physical-photography sense.

**Self-correcting via user feedback**: when detection is shown to the user, let them confirm or correct it. Record corrections as training signal — not just for that user, but to improve detection accuracy for other sellers with similar characteristics going forward. This is a genuine self-learning loop, not a one-off preference toggle: wrong guesses should make the *system* better, not just that one user's experience.

**Save what's learned per shop**: once niche/type is established (and reinforced or corrected over time), persist it as a first-class attribute of the shop, used going forward as a lens for which insights, benchmarks, tone, and mascot prompts are relevant.

---

## 10. Third-Party Data Integrations

**Auth constraint**: Lovable currently manages authentication and encryption keys for the platform. Any third-party integration (OAuth tokens, API keys for connected services) must work within Lovable's existing auth/security model, not stand up a parallel system. Confirm how Lovable handles secret storage/encryption today and extend that pattern for third-party credentials rather than reinventing it.

**Check Etsy's own data first**: before adding external tools, verify what Etsy's own API now exposes — Etsy has rolled out native "Marketplace Insights" (search volume, trending keywords, competition data) directly through Shop Manager. If this is available via the API, it may cover ground previously assumed to require a third-party SEO tool, and should be pulled in as first-party Etsy data (Section 8) rather than a separate integration.

Build **actual, working integrations** for this pass — not just architecture. Start with:
- Google Analytics (traffic sources, on-site behavior if the seller has an external site)
- One additional data source, to be determined: research which Etsy-adjacent tools (SEO/keyword/competitor research platforms) actually offer a public developer API — most popular ones (eRank, Sale Samurai, EtsyHunt, EverBee, Alura) are built as their own extensions/dashboards without confirmed third-party API access as of this writing, so this needs verification before committing. If nothing suitable has a real API, note that and build just the Google Analytics integration plus the pluggable pattern for now.

But build them as instances of a **templated, pluggable integration pattern** — a defined interface/contract (auth flow, data-fetch shape, mapping into the insight pipeline) that a future integration can follow with minimal custom work. The goal: adding the next platform later should mostly be "implement this interface for provider X," easy enough to hand to Claude Code as a scoped, well-bounded task, not a redesign of the integration layer itself.

Each integration should feed the same insight/action pipeline as native Etsy data — not live in its own separate silo or require the seller to interpret it themselves.

---

## 11. Action-First, Not Just Informational

Every insight should come with a concrete next step, not just a finding. "Your CTR is down" is not sufficient — pair every observation with a suggested action (specific tag to add, specific photo to swap, specific price test to try). Where feasible, let the seller act directly from the insight (e.g. apply a suggested tag with one tap) rather than making them navigate elsewhere to make the change themselves.

---

## 12. User Experience & Anticipatory Flow

**Information density**: avoid walls of text. Insights and recommendations should be scannable — short statements, clear actions, expandable detail only for sellers who want it (ties to the default/advanced toggle in Section 7).

**Design for actual user flow, not just feature list**: map the natural sequence of what a seller does in a session — e.g. editing a description often leads to checking photos next, or reviewing a listing often leads to checking its stats. Anticipate these transitions rather than forcing the seller to hunt for the next relevant thing.

**Anticipatory surfacing**: when the platform can reasonably predict what the seller is about to want (e.g. they've been editing a listing's description — they'll likely want to check its photos or recent stats next), surface that proactively rather than waiting to be asked. This is where the mascot (Section 13) becomes more than decorative — e.g. popping in with "want to check how your stats have changed since last time?" at the natural moment, not at a random interval.

**Goal**: the platform should feel like it's a step ahead, not like a dashboard the seller has to interrogate. Every screen should make the *next* likely action obvious or already offered.

---

## 12a. AI Service Fallback Behavior

The platform's grading, fix generation, Echo chat, and listing rewrites all depend on the Lovable AI Gateway (Gemini 2.5 Flash). Define and implement explicit fallback behavior for when this service is slow, rate-limited, or erroring — don't leave this undefined:
- **Grading/insights**: if a fresh AI call fails, fall back to the last successfully computed grade/insight (clearly marked as "as of [date]" rather than presented as current) rather than showing an error or blank state.
- **Echo chat**: show a clear, friendly message if a response can't be generated right now, with a retry option — never a silent failure or generic error screen.
- **Fix generation / listing rewrites**: if generation fails, tell the seller plainly rather than silently not producing a result, and don't charge tier usage/quota for failed attempts.
- Log failures for admin visibility (tie into `ai_usage_events`/`api_quota_log`, which already exist) so degraded AI service is visible on the admin side, not just discovered anecdotally.

---

## 13. Future Ideas — Not In Scope for This Pass

Captured here so they aren't lost, but deliberately excluded from this build so the core functionality gets full attention first. Revisit as a dedicated follow-up brief once Sections 2-7 are solid.

**Mascot / character assistant**
- **Reconcile with Echo first — this is a confirmed, not hypothetical, conflict**: the current app already ships both a "Radar's Insight" proactive-insight box on the Dashboard and a separate "Echo Picks" section on the same screen — two different assistant identities live in production today. Resolve this before adding a mascot on top of it, or there will be three. The existing "Radar's Insight" box (lavender highlight, first-person voice: *"Radar is scanning your niche for trending tags..."*) is actually a reasonable foundation for the proactive-assistant voice described in Section 5 — consider evolving it into the mascot's voice rather than starting over, once the naming is unified with Echo (or a deliberate decision is made to keep them distinct, documented clearly either way).
- A round, cute radar-shaped creature as the visual embodiment of the assistant — reinforces the RadarIQ identity (a "sensor" softened into something alive) and gives a consistent personality anchor.
- Appears on screen to deliver an insight, animates away when dismissed (e.g. jumps off-screen).
- Physics-reactive dismissal: user can "flick" the character off-screen, triggering a ragdoll-style toss animation instead of a static close button.
- Decide whether the flick gesture is purely cosmetic dismissal or also functions as a "not interested" signal that feeds back into what the assistant chooses to surface next (the existing `dismissed_alerts` table is a natural home for this signal) — these are different product behaviors and should be designed deliberately, not defaulted.
- Real scope: character design, idle/talk/toss/land animation states, physics for the gesture. Worth its own dedicated design pass rather than folding into this build.

**"The agent is learning" signal**
- Light, honest meta-stats surfaced to the seller — e.g. "I've reviewed 340 of your photos" or "my last few lighting suggestions worked well for you, so I'm weighting that higher."
- Must be grounded in real outcome tracking (did the seller adopt a suggestion, did the relevant metric improve afterward) — not invented or decorative numbers. This is a trust feature as much as a fun one, so accuracy matters more than charm here.

---

## 14. Success Criteria (Self-Check Before Calling This Done)

Fable should validate its own work against these before considering the pass complete:

- A non-technical seller can understand every default-view insight without needing to open the advanced view
- No insight is ever shown without a concrete, specific action attached (Section 11) — no bare observations
- No proactive notification fires without passing the priority/confidence gate (Section 5) — verify this is actually enforced in code, not just designed
- No new live credentials get committed during this build (`.gitignore` correctly excludes `.env`), and all edge functions consistently enforce auth (`verify_jwt` and internal checks aligned) — verify, don't assume the audit's findings were the only ones
- Admin impersonation no longer requires (or risks) exposing another user's tokens client-side, and is audit-logged
- The interface requires no legend, tooltip-heavy tutorial, or onboarding walkthrough to understand at a glance
- Visual design matches Section 7a's direction — if it looks like a generic dark-mode SaaS dashboard, it has not succeeded
- The interface meets WCAG accessibility basics (contrast, keyboard nav, screen-reader labeling) — verify, don't assume the warm palette is automatically accessible
- The mobile experience is genuinely primary (touch targets, text sizing, layout) and desktop is fully functional, not an afterthought or the reverse
- Every new feature has an explicit tier assignment (Section 2) — nothing is left ambiguously gated
- The Etsy API ToS/compliance check (Section 4) was actually performed and documented, not assumed
- The black-page rendering issue (Section 4) was diagnosed with a specific root cause identified, not just guessed at
- Third-party integrations (Section 10) are live and functional, and follow the pluggable pattern well enough that a second integration could plausibly be added by following the same interface
- The architecture document exists, is current as of the end of the run, and would actually let someone unfamiliar with the codebase understand what's built and why
- Tier gating (Section 2) was reviewed holistically at the end and passes the "Free feels respected, upgrade feels worth it" test — not decided piecemeal per feature
- Recommendations genuinely differ for at least made-to-order, digital-download, and physical-inventory sellers — not the same advice relabeled
- The Radar/Echo naming collision is resolved with one consistent assistant identity across every screen — verify by checking the Dashboard specifically, where both names currently appear together
- The Intelligence-vs-Dashboard data contradiction (196 need attention vs. "no pending actions") no longer reproduces
- The Store Health Score appears once per screen, not duplicated, and the Priority Actions list isn't shown twice with the same content
- No grade/score display uses blunt letter-grade-only framing (F, D, "Poor") without encouraging, action-oriented context alongside it
- AI service fallback behavior (Section 12a) is implemented and testable — verify by simulating a Lovable AI Gateway failure and confirming the seller sees a graceful message, not an error or blank state

---

## 15. Suggested Build Sequence

**This is the authoritative execution order** — the numbered sections elsewhere in this brief are grouped by topic for readability, not by when to build them. The logic behind this order, in priority: (1) fix live risk first — security issues aren't optional or schedulable around feature work, (2) never build new intelligence on top of a foundation that's still drifting or broken, (3) respect real dependencies — type detection before type-branched recommendations, gating logic before the proactive UI that relies on it, (4) parallelize independent work once dependencies are satisfied, (5) gate/monetization decisions last, once the full feature set exists to judge fairly.

Sequence:

1. **Remaining security/stability fixes first**: fix `verify_jwt` inconsistencies, remove client-side token exposure, and redesign admin impersonation properly (Section 2). Credential rotation itself is being handled separately — just ensure `.gitignore` is correct and no new secrets get committed during this build. These are live risks, not design debt — handle before or in parallel with the very start of the rest of the build, not sequenced behind feature work.
2. **Section 2's remaining pipeline audit next**: fix breaks and drift before building anything new on top of it. New intelligence built on a drifting pipeline compounds the drift.
3. **The black-page rendering diagnosis (Section 4)** should happen early too — it's likely blocking API approval independent of everything else, and it's cheap to investigate relative to the rest of the build.
4. **Section 8's unused-data audit** alongside Section 2, since findings here may change what Sections 3-4 are able to build.
5. **Sections 3-4 (photo, trend)** once the pipeline and data foundation are solid — and once seller-type detection (Section 9) exists, since Section 3's recommendations need to branch by type.
6. **Section 5's priority-gating logic** before wiring up any proactive UI (Section 12) — the gating is what makes proactive surfacing trustworthy rather than noisy.
7. **Sections 6, 9 (refresh, niche/type detection)** can run in parallel with 3-4, since they're largely independent subsystems, but Section 9 should land before Section 3 is finalized (see above).
8. **Section 10 (integrations)** can also run in parallel once the core insight pipeline (post Section 2) is stable enough to feed.
9. **Section 12 (UX/anticipatory flow) and Section 7a (visual direction) next**, once the underlying logic is trustworthy enough to build a confident UI on top of it.
10. **Tier gating pass (Section 2) last**, once the full feature set exists to review holistically — not decided feature-by-feature along the way.

---

## 16. Deliverable Format Requested from Fable 5

1. Full codebase audit findings (bugs, drift, broken traces through the pipeline)
2. Summary of unused API data found and what was wired in vs. deferred
3. Implementation of fixes and new features above
4. UI/UX redesign reflecting the two-mode, theme-adaptive, warmth-first approach (Sections 6, 7, 7a)
5. Self-check results against Section 14's success criteria
6. A clear, ranked list of anything it recommends but did not build (with reasoning), for review before the next pass
7. **A Lovable handoff prompt** — Lovable manages Supabase for this project (no direct API access outside Lovable's interface), so provide a clear, self-contained prompt/summary written *for Lovable* covering anything built or changed here that Lovable needs to wire up, configure, or be aware of: schema/migration changes, edge function additions or changes, auth/session changes (especially the impersonation redesign), any AI chat (Echo) changes, new environment variables or secrets required, and cron/scheduling changes. This should be usable as a standalone prompt pasted directly into Lovable, not just an internal engineering note.

## 17. Decision-Making Guidance

Where this brief doesn't give a clear answer and a real decision is required, use best judgment rather than stalling or guessing arbitrarily. When weighing options:
1. **Fairest and safest to the user first** — when a choice affects sellers directly (data handling, what's shown, gating, defaults), prefer the option that treats them most fairly and safely, even if a more aggressive option would perform better short-term.
2. **Company's interest as the tiebreaker** — when multiple options are roughly equally fair and safe to the user, prefer whichever best serves RadarIQ's business interests (conversion, retention, differentiation).
Document the reasoning for any non-trivial judgment call in the architecture document, so it can be reviewed rather than silently baked in.
