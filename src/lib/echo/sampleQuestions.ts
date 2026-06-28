/**
 * Context-aware sample-question chips rendered in Echo's empty state.
 * Each entry returns 3-4 short prompts tailored to the current page (and
 * the loaded listing, when applicable).
 */
import type { EtsyListing } from '@/types'

export interface PageContextLite {
  route: string
  pathname: string
  listingId?: string | null
}

function listingSet(listing?: EtsyListing | null): string[] {
  const title = (listing?.title ?? 'this listing').slice(0, 40)
  const score = listing?.current_grade
  return [
    score != null
      ? `Why is "${title}" scoring ${score}?`
      : `Why isn't "${title}" performing better?`,
    `What 3 tags should I add to "${title}"?`,
    `Rewrite this title for SEO`,
    `Compare this to my top performer`,
  ]
}

const STATIC_SETS: Record<string, string[]> = {
  '/app/dashboard': [
    `What changed in our shop this week?`,
    `Which listing should I optimize first?`,
    `Why is my health score where it is?`,
    `What's our biggest growth lever right now?`,
  ],
  '/app/listings': [
    `Which listings are decaying fastest?`,
    `Find listings missing materials`,
    `Group my listings by performance`,
    `Which listings haven't been optimized yet?`,
  ],
  '/app/review': [
    `Walk me through this pending optimization`,
    `Are these tag changes safe?`,
    `Which pending change has the most upside?`,
  ],
  '/app/performance': [
    `Did my last optimization actually work?`,
    `Which optimizations had real lift?`,
    `What's my best ROI move from the last 30 days?`,
  ],
  '/app/intelligence': [
    `What is Intelligence telling me right now?`,
    `What pattern across my shop should I act on?`,
  ],
  '/app/ab-testing': [
    `Which listing is the best A/B test candidate?`,
    `How long should I let a test run?`,
    `Explain how variants are picked`,
  ],
  '/app/store-profile': [
    `What should my brand voice sound like?`,
    `How do I describe my ideal customer?`,
    `Why does personalization matter for my listings?`,
  ],
  '/app/settings': [
    `What's included in my current plan?`,
    `How do I rotate my Etsy connection?`,
  ],
  '/app/new-listing': [
    `Write a strong title for a new listing`,
    `What tags work best for a new product?`,
    `What photo set should I plan?`,
  ],
}

const FALLBACK: string[] = [
  `What should I focus on today?`,
  `Pick the highest-leverage listing to optimize`,
  `What's our shop's biggest weakness right now?`,
]

export function getSampleQuestions(ctx: PageContextLite, listing?: EtsyListing | null): string[] {
  if (/^\/app\/listings\/[^/]+$/.test(ctx.pathname)) return listingSet(listing)
  return STATIC_SETS[ctx.pathname] ?? FALLBACK
}
