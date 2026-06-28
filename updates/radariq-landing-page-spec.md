# RadarIQ — Landing Page Redesign Spec
## Claude Code Build Document

---

## CRITICAL FIRST STEP — READ BEFORE TOUCHING ANYTHING

1. **Read the existing landing page fully** — every section, every
   component, every line of copy. Understand what is already there.
2. **Read lovable.md** (or any .md in project root — find it first)
3. **Read the existing design system** — color tokens, typography,
   component patterns, spacing. Document what you find.
4. **Read package.json** — do not install anything already present
5. **Find the existing Supabase client** — do not create a second one
6. **Find the existing waitlist/signup component** — reuse it, don't rebuild it
7. **Find the existing social proof / testimonial section** —
   DO NOT CHANGE IT. Leave it exactly as it is. Build around it.
8. **List everything you found** before writing a single line of code

Only after completing the audit should you begin building.

---

## Project Context

**RadarIQ** — Etsy listing optimization SaaS
- **Stack:** React + Tailwind (Lovable-generated codebase)
- **Primary color:** `#00C4AF` (teal)
- **Accent color:** Amber — used for HIGH IMPACT badges
- **Tiers:** Free / Starter ($14) / Pro ($39)
- **Current state:** Beta, appearing in search, zero signups
  → Landing page is not converting existing traffic
  → This redesign fixes that

**Target user:** Etsy sellers who are serious enough to look for
tools but frustrated that existing tools give data without direction.
They're on mobile as often as desktop. They're skeptical of hype.
They respond to specificity and honesty over feature lists.

**The emotional truth to land:**
> RadarIQ thrives when its users succeed. Not when they subscribe —
> when they actually grow. That's a different kind of tool.

---

## Design Direction

### Aesthetic
Confident, clean, human. Not corporate. Not generic AI tool aesthetic.
Not purple gradients. Not floating dashboard screenshots on a dark background.

The visual language should feel like a knowledgeable friend who happens
to be really good at this — direct, warm, specific. Think editorial
meets utility. Every visual choice should earn its place.

### What Makes This Page Unforgettable
The contrast between what other tools say and what RadarIQ says.
That contrast — shown visually, not just described — is the hook.
The "We Built This Differently" section should feel like a breath
of fresh air compared to every other SaaS landing page they've seen.

### Mobile First
Most Etsy sellers browse on their phones. Every section must work
perfectly at 375px width before you think about desktop layout.
Hero CTA must be thumb-reachable. No horizontal scroll. No tiny text.

### Performance
Hero section must load fast. No heavy animations above the fold.
Subtle entrance animations below the fold are fine — use them
intentionally, not decoratively.

---

## Page Structure

Build in this exact order. Each section is described in full below.

```
1. Nav
2. Hero
3. The Contrast (what others do vs what RadarIQ does)
4. How It Works (the four-step loop)
5. The Honesty Section
6. [EXISTING social proof section — DO NOT TOUCH]
7. Pricing
8. Bottom CTA
9. Footer
```

---

## Section 1: Nav

**Keep it minimal.** Brand mark left, one CTA right. Nothing else.

```
[RadarIQ logo]                    [Start Free →]
```

- Sticky on scroll
- Background becomes slightly opaque on scroll (backdrop blur)
- CTA button uses primary teal `#00C4AF`
- On mobile: logo left, CTA right, no hamburger needed
  (no nav links to hide — keep it clean)
- "Start Free" scrolls to or links to signup/waitlist

---

## Section 2: Hero

### The Hook Strategy
Lead with the pain, not the product. Etsy sellers know their
listings aren't performing. They don't know why. That's the hook.

### Copy

**Headline (large, confident, specific):**
```
You're not losing on Etsy because
your products aren't good enough.
```

**Subheadline:**
```
You're losing because your competitors know something
about the algorithm that you don't.

RadarIQ shows you exactly what they know —
then helps you use it.
```

**Supporting line (small, below subheadline):**
```
See what's winning in your market right now.
Fix it in one click. Track whether it worked.
```

**CTA block:**
```
[Get Early Access — It's Free]
No credit card required · Founding member pricing locked in during beta
```

**Trust signal below CTA:**
```
[waitlist counter — use existing component]
sellers already getting early access
```

### Visual Treatment
- Headline is large — commanding, not decorative
- "not good enough" and "what they know" can use teal accent
  to draw the eye through the key idea
- Consider a subtle animated background element that suggests
  market data / signals without being literal (gentle particle
  drift, soft grid, or abstract waveform — not a dashboard screenshot)
- No hero image of a fake dashboard — those feel generic and unearned
- Hero takes up full viewport height on desktop, 85vh on mobile

### A/B Ready
The headline must be in its own clearly named component or variable
so it can be swapped without restructuring the page.
```tsx
// Example:
const HERO_HEADLINE = {
  line1: "You're not losing on Etsy because",
  line2: "your products aren't good enough."
}
```

---

## Section 3: The Contrast

### Purpose
This is the core differentiator section. Show — don't just say —
how RadarIQ is different from every other Etsy tool.

### Headline
```
There's a better way to grow on Etsy.
```

### Subheadline (small, above headline)
```
WHAT MAKES RADARIQ DIFFERENT
```

### The Contrast Cards

Four contrast pairs. Each shows what other tools do vs what RadarIQ does.
Visual: two columns or a before/after toggle treatment.
Left side (other tools): muted, slightly faded, red X
Right side (RadarIQ): vivid, teal check, confident

```
Pair 1 — Tag advice
❌ Other tools:
"Your tags could be better."

✅ RadarIQ:
"Add these 3 tags. Your top competitors
all use them. Add them to your listing
right now — we'll do it for you."

─────────────────────────────────────

Pair 2 — Score without meaning
❌ Other tools:
"Your title score is 6.2."

✅ RadarIQ:
"Your title is 27 characters shorter than
listings ranking above you. Here's a
market-informed rewrite — ready to apply."

─────────────────────────────────────

Pair 3 — Pricing advice
❌ Other tools:
"Consider your pricing strategy."

✅ RadarIQ:
"You're priced 34% above your niche.
Here's exactly where top sellers cluster —
and what they're doing differently."

─────────────────────────────────────

Pair 4 — The follow-through
❌ Other tools:
"Here's your report. Good luck."

✅ RadarIQ:
"That tag update 7 days ago improved your
market score by 8 points. Here's your
next move."
```

### Design Notes
- This section should feel a little edgy — not mean, but honest
- The ❌ side should feel recognizable (users will nod)
- The ✅ side should feel genuinely exciting (users will lean in)
- On mobile: stack vertically, ❌ first then ✅ for each pair
- Consider a subtle separator between pairs
- Teal accent on all ✅ RadarIQ text

---

## Section 4: How It Works

### Purpose
Teach the platform's mental model before users sign up.
After reading this section they should understand the core loop
and feel confident they'll know how to use it.

### Headline
```
Built around one simple loop.
```

### Subheadline (small, above)
```
HOW RADARIQ WORKS
```

### The Four Steps

Each step has: number, name, description, and a subtle icon or
visual accent. Steps should feel connected — like a loop, not
a list. Consider a connecting visual element between steps.

```
01  SEE IT
────────────────────────────────────────
Connect your shop. In 60 seconds we scan
your market, find your real competitors,
and show you exactly where you stand —
not just as a score, but as a real
position in your niche right now.

02  UNDERSTAND IT
────────────────────────────────────────
Every insight is specific to your actual
market. Not keyword databases. Not generic
advice. What's winning for your exact
search terms today — and the specific
gaps between them and you.

03  FIX IT
────────────────────────────────────────
We don't just tell you what to change.
For most optimizations, we make the
change directly to your Etsy listing
with one click. You approve everything.
You can undo anything. Always.

04  TRACK IT
────────────────────────────────────────
Seven days after every change, we tell
you whether it worked. Score improved —
here's why. Stayed flat — here's what
to try next. No guessing. Just honest
feedback on what's actually moving
the needle for your shop.
```

### Design Notes
- Steps should feel like a journey, not a checklist
- Number treatment should be bold and large — typographic anchor
- Step names (SEE IT, UNDERSTAND IT, etc.) in teal or amber
- On desktop: 2x2 grid or horizontal flow with connecting line
- On mobile: single column, full width
- Each step card should have enough breathing room to feel premium
- Subtle entrance animation as user scrolls into each step

---

## Section 5: The Honesty Section

### Purpose
This is the most important section for emotional resonance.
It should feel personal, not like marketing copy.
This is where RadarIQ's values become a differentiator.

### Visual Treatment
This section should look visually different from the rest of the page.
Options:
- Teal background with white text (inverted, high contrast)
- Off-white or warm cream background vs the rest of the page
- Large pull quote treatment with generous whitespace
- Handwritten-style accent or serif headline font to signal authenticity

Whatever treatment — it must feel intentionally different.
Like the founder stopped to say something real.

### Headline
```
We built this differently.
```

### Subheadline (small, above)
```
OUR COMMITMENT TO YOU
```

### Body Copy

Each paragraph is its own statement. Give them room to breathe.
Short paragraphs. Direct sentences. No bullet points here.

```
Most tools are built to keep you subscribed.
We're built to get you results.

That means we'll tell you when something isn't working —
even if it's our own recommendation that fell flat.

Your data keeps working for you on every plan.
When you upgrade, your history is already waiting.
We've been building your insights from day one.

We add features our users actually ask for.
Not features that look good on a pricing page.

If the algorithm changes and our recommendations stop
working, we'll tell you — and we'll update our model.
We'd rather be honest about a gap than pretend it doesn't exist.

We measure our success by one thing:
whether your shop is actually growing.

If it's not, that's our problem to solve — not yours to figure out alone.
```

### Pull Quote (large, typographic anchor)
```
"Your success is literally
 how we measure ours."
```

This should be the visual centerpiece of the section.
Large type. Teal accent. Feels like a promise, not a tagline.

---

## Section 6: Existing Social Proof

**DO NOT TOUCH THIS SECTION.**
Find it in the existing codebase and leave it exactly as it is.
Build Section 7 (Pricing) immediately after it.

---

## Section 7: Pricing

### Headline
```
Pricing that grows with you.
```

### Subheadline
```
We believe you should see real value before you pay.
That's why our free plan actually does something useful.
```

### Pricing Cards

Three cards: Free, Starter, Pro.
Pro card is visually elevated (recommended treatment).
Founding member beta pricing note on all paid tiers.

```
FREE
─────────────────────────
Everything to get started.

· 1 listing fully analyzed
· Your market score
· Missing tag count
· 7-day score history
· 1-click tag fixes

[Start Free →]
No credit card needed

─────────────────────────

STARTER  $14/mo
─────────────────────────
For sellers getting serious.

· 5 listings analyzed
· Your market score
· Top 3 missing tags shown
· 30-day score history
· Basic competitor data
· Weekly email digest
· 1-click tag fixes

[Start Starter →]
Founding member pricing —
locked in for life

─────────────────────────

PRO  $39/mo          ← MOST POPULAR badge
─────────────────────────
For sellers who want results.

· All listings
· Full market intelligence
· All missing tags + why
· Unlimited score history
· Full competitor details
· Real-time alerts
· 1-click guided fixes
· Market-informed AI
· Echo store advisor
· Direct listing edits

[Start Pro →]
Founding member pricing —
locked in for life
```

### Below Cards
```
No contracts. Cancel anytime.
Your data stays yours — always exportable.

Questions before signing up?
hello@radariq.app — we actually respond.
```

### Design Notes
- Pro card: elevated with subtle shadow, teal border accent,
  "MOST POPULAR" amber badge in top right corner
- Free card: clean, no border elevation needed
- On mobile: stack all three, Pro card first
- Feature list items use teal checkmarks
- "Founding member pricing" note in amber — draws the eye,
  creates urgency without being pushy

---

## Section 8: Bottom CTA

### Purpose
Last chance to convert. Should feel like an invitation, not a push.
Tie back to the emotional promise of the page.

### Copy
```
Your shop deserves better than guesswork.

RadarIQ is in beta and growing fast.
Sellers who join now get founding member pricing —
locked in for life — plus direct input on what
we build next.

We're not building for the algorithm.
We're building for you.

[Get Early Access — Start Free]

[waitlist counter — existing component]
```

### Design Notes
- Full width, dark background (near black or very deep teal)
  to create visual weight and finality
- White headline, teal accent on key phrases
- Single CTA button — large, centered, unmissable
- Waitlist counter below button for social proof
- No competing links or distractions

---

## Section 9: Footer

Minimal. Clean. Functional.

```
[RadarIQ logo]

[Privacy Policy]  [Terms]  [Contact]

hello@radariq.app

© 2026 RadarIQ. Built for sellers, not shareholders.
```

The tagline "Built for sellers, not shareholders" — optional but
consider it. It reinforces the honesty section values in one line.

---

## Animation and Interaction Guidelines

### What to Animate
- Hero headline: subtle fade-up on load (fast — under 400ms)
- Contrast cards: staggered entrance on scroll (subtle, not dramatic)
- How It Works steps: fade-up as user scrolls into each one
- Pricing cards: gentle scale-up on hover (desktop only)
- CTA buttons: smooth background transition on hover

### What NOT to Animate
- Nothing in the nav
- Nothing that blocks content from being readable
- No looping animations that distract from reading
- No animations above the fold that delay perceived load

### Performance Rule
If an animation adds more than 50ms to time-to-interactive,
remove it. Content is more important than motion.

---

## Copy Rules — Voice Consistency

Every line of copy on this page must pass this test:

```
Would a confident, knowledgeable friend say this?
Or does it sound like a marketing team wrote it?
```

**Never use:**
- "Leverage" / "Utilize" / "Optimize your journey"
- "Powerful" / "Robust" / "Cutting-edge"
- "Take your shop to the next level"
- "Unlock your potential"
- Exclamation points (they undermine confidence)
- Passive voice

**Always use:**
- Specific numbers when available
- Direct second person ("you", "your shop")
- Short sentences
- Active voice
- Honest qualifiers when appropriate

---

## Technical Requirements

- Mobile-first, responsive at 375px, 768px, 1280px, 1440px
- Existing Supabase client for waitlist/signup — do not create new one
- Existing waitlist counter component — reuse it
- Existing social proof section — leave completely untouched
- Existing color tokens — do not hardcode new hex values
  unless extending the system with documented justification
- Page must pass Lighthouse performance score > 85 on mobile
- All images use next-gen formats (webp) with fallbacks
- All CTA buttons link to the same signup/waitlist destination
- Headline is in its own named component/variable for A/B testing

---

## What Success Looks Like

A seller landing on this page from a search result should:

1. Read the headline and immediately feel understood
2. Read the contrast section and think "yes, that's exactly my problem"
3. Read How It Works and feel confident they understand the product
4. Read the Honesty section and feel like this is different from
   every other tool they've tried
5. See the pricing and think "that's fair, I can start free"
6. Click a CTA

They should not need to read the whole page to get the point.
The headline and contrast section alone should be enough to
make a curious visitor want to know more.

That's the bar. Build to that bar.
