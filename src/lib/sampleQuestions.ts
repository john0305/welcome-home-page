import type { PageContext } from '@/hooks/usePageContext'

export interface SampleQuestionSet {
  simple: string[]     // 2 questions
  advanced: string[]     // 2–3 questions
  deep: string[]         // 1–2 questions
}

function interpolateListingName(questions: string[], listingTitle?: string): string[] {
  const name = listingTitle ?? 'this listing'
  return questions.map((q) => q.replace(/\[listing name\]/g, `"${name}"`))
}

const DASHBOARD: SampleQuestionSet = {
  simple: [
    "What's the one thing I should fix in our shop today?",
    "How did our shop do this month?",
  ],
  advanced: [
    "Which of our listings have the best potential I haven't touched yet?",
    "Are our prices in the right range for what we sell?",
  ],
  deep: [
    "Walk me through exactly why our health score is where it is and what moves it the most",
  ],
}

const LISTING_DETAIL: SampleQuestionSet = {
  simple: [
    "How is [listing name] doing right now?",
    "What's the fastest fix for [listing name]?",
  ],
  advanced: [
    "Why are people viewing [listing name] but not buying?",
    "How do the tags on [listing name] compare to what's ranking?",
  ],
  deep: [
    "Break down every factor in [listing name]'s grade and rank them by impact",
  ],
}

const LISTINGS: SampleQuestionSet = {
  simple: [
    "Which of our listings need attention most urgently?",
    "Show me our worst performing listings",
  ],
  advanced: [
    "Which listings have views but no sales — and why?",
    "If I could only optimize 5 listings this week, which ones?",
  ],
  deep: [
    "Map out which categories in our shop are pulling their weight and which aren't",
  ],
}

const PERFORMANCE: SampleQuestionSet = {
  simple: [
    "How is our shop trending compared to last month?",
    "What's been our best seller recently?",
  ],
  advanced: [
    "Which optimizations we approved have actually improved performance?",
    "What time of year do our best categories tend to pick up?",
  ],
  deep: [
    "Build me a picture of what's working in our shop and what isn't, using the numbers",
  ],
}

const PERSONALIZE_AI: SampleQuestionSet = {
  simple: [
    "Why does filling this in make my optimizations better?",
    "What happens if I leave some questions blank?",
  ],
  advanced: [
    "Which questions here have the biggest impact on listing quality?",
    "Based on what I've filled in, what kind of listings would Echo write for our shop?",
  ],
  deep: [
    "Walk me through all 14 questions and tell me which ones matter most for a shop like ours",
  ],
}

const DEFAULT: SampleQuestionSet = {
  simple: [
    "What should I focus on in our shop right now?",
    "Give me a quick health check on where we stand",
  ],
  advanced: [
    "What's the biggest opportunity we haven't acted on yet?",
    "Which part of our shop needs the most work?",
  ],
  deep: [
    "Walk me through the full picture of our shop — what's working, what isn't, and what to do next",
  ],
}

const SETS_BY_LABEL: Record<string, SampleQuestionSet> = {
  'Dashboard': DASHBOARD,
  'Listings': LISTINGS,
  'Listing Detail': LISTING_DETAIL,
  'Optimizations': LISTINGS,
  'Review': DEFAULT,
  'Performance': PERFORMANCE,
  'Intelligence': DEFAULT,
  'A/B Testing': DEFAULT,
  'Personalize AI': PERSONALIZE_AI,
  'Settings': DEFAULT,
  'New Listing': DEFAULT,
}

export function getSampleQuestions(ctx: PageContext): SampleQuestionSet {
  const base = SETS_BY_LABEL[ctx.pageLabel] ?? DEFAULT

  if (ctx.pageLabel === 'Listing Detail' && ctx.listingTitle) {
    return {
      simple: interpolateListingName(base.simple, ctx.listingTitle),
      advanced: interpolateListingName(base.advanced, ctx.listingTitle),
      deep: interpolateListingName(base.deep, ctx.listingTitle),
    }
  }

  return base
}
