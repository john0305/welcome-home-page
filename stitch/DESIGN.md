# RadarIQ Design System

## Brand Vision
RadarIQ is the Etsy seller's secret weapon — warm, smart, and deeply human. Think of it like having a brilliant business-savvy friend who also happens to know everything about SEO, competitor analysis, and photo optimization. The design should feel like a creative studio meets a data intelligence platform: approachable for a first-time seller of handmade bracelets, powerful enough for a high-volume digital shop owner.

**Anti-patterns to avoid:** No dark/cyberpunk vibes. No cold corporate blues. No overwhelming data grids. No tech jargon without explanation.

## Color System
- **Primary:** Deep Forest Teal `#1A6B5A` — trust, growth, intelligent
- **Secondary:** Warm Terracotta `#D97B45` — creativity, warmth, Etsy-adjacent energy
- **Tertiary:** Soft Violet `#7C5CBF` — AI magic, insights, a touch of the unexpected
- **Surface backgrounds:** Warm off-white `#FAF9F6`, cream cards `#FFFFFF`, warm gray `#F3F1EE`
- **Text:** Rich near-black `#1C1917` for headings, `#44403C` for body, `#78716C` for muted
- **Grade colors:** A=emerald, B=teal, C=amber, D=rose, F=red — always paired with a readable background

## Typography
- **Bricolage Grotesque** for all headlines and KPI numbers — expressive, creative, modern confidence
- **Plus Jakarta Sans** for body text, descriptions, and UI copy — clean, warm, readable
- **Inter** for labels, badges, data, small UI elements — neutral precision

## Layout Philosophy
- Left sidebar navigation (collapsible) with icon+label, 240px expanded / 64px collapsed
- Top header with shop name, health score ring, notification bell, and Radar AI chat trigger
- Pages use a generous content area with 24px gutters and max-width 1280px
- Cards use 16px padding minimum, 24px for featured content
- Mobile-first responsive: bottom nav on mobile, sidebar on desktop

## Component Personality
- **Buttons:** Rounded-full for CTAs, rounded-xl for secondary actions. Never sharp corners.
- **Cards:** Soft shadow (shadow-sm), warm white background, subtle 1px warm-toned border
- **Score/Grade rings:** Large, prominent, animated fill on load. These are the hero of many pages.
- **AI suggestions:** Distinct teal-left-border treatment with a small Radar sparkle icon
- **Competitor intel:** Purple/violet accent to distinguish it as 'external world' data
- **Empty states:** Illustrated, encouraging, never just 'No data found'
- **Toasts/notifications:** Bottom-right, warm, max 2 visible, auto-dismiss 5s

## Key UX Principles
1. **Guide first, data second** — Tell the seller what to DO before showing them why
2. **Progressive disclosure** — Simple view by default, 'See more' expands details
3. **Celebrate wins** — Score improvements, first optimization, 100% title — all get microanimations
4. **Zero dead ends** — Every empty state has a next action. Every error has a recovery path.
5. **Radar AI is always one click away** — Floating chat button on all pages, context-aware
6. **One-click optimize** — 'Optimize All' button prominent on Listings page header
7. **Full seller control** — Nothing pushes to Etsy without explicit 'Publish' button click

## Gamification / Engagement Layer
- **Shop Score ring** on dashboard — animates from 0 to current on load. Color changes by grade.
- **Streak counter** — 'You've optimized 3 listings this week' progress bar
- **Achievement badges** — First optimization, 10 listings graded, competitor tracked, etc.
- **Weekly Wins card** — Every Monday, a summary of what improved
- **Before/After comparisons** — Show old vs new listing copy side-by-side when approving

## Page Map
1. Dashboard — Shop health overview, score ring, KPI cards, quick wins, activity feed, Radar chat
2. Listings — Card grid/list toggle, filter bar, grade badges, optimize button per listing
3. Listing Detail — Full listing analysis, image feedback, competitor comparison, fix queue
4. Optimize Flow — Step-by-step: Title → Tags → Description → Materials → Image → Review → Publish
5. Intelligence — Competitor tracking, tag gap analysis, search rank trends, niche insights
6. Performance — Charts for views, favorites, sales over time, before/after optimization correlation
7. Radar AI Chat — Full-page AI agent, context-aware, knows shop + current page
8. Settings — Etsy connection, plan, notification preferences, optimization preferences
9. Onboarding — Connect Etsy → Select goals → First scan → First insight (4-step wizard)