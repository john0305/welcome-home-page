/**
 * Client-rendered opening message for Echo's empty state — no API call,
 * not persisted, not sent to the model.
 */
import type { EtsyListing } from '@/types'
import type { ShopIntelligence } from '@/hooks/useShopIntelligence'

export interface OpeningCtx {
  pathname: string
  shopHealthScore?: number | null
}

export function getOpeningMessage(
  ctx: OpeningCtx,
  listing?: EtsyListing | null,
  intelligence?: ShopIntelligence | null,
): string {
  if (/^\/app\/listings\/[^/]+$/.test(ctx.pathname) && listing) {
    const title = listing.title?.slice(0, 80) ?? 'this listing'
    const grade = listing.current_grade ?? '—'
    return `I can see we're looking at **${title}**. It's sitting at **${grade}/100** right now. Ask me anything about it, or pick a question below.`
  }

  if (ctx.pathname === '/app/dashboard') {
    // Prefer real shop_intelligence data when available
    if (intelligence) {
      const score = intelligence.overall_market_score ?? ctx.shopHealthScore ?? null
      const top = intelligence.top_opportunities?.[0]
      if (score !== null && top) {
        const name = (top.listing_title ?? 'one of your listings').slice(0, 60)
        return `Our store score is **${score}/100** and our biggest opportunity right now is **+${top.impact_points} pts on ${name}**. Want me to walk you through it?`
      }
      if (score !== null) {
        return `Our store score is **${score}/100** right now. I've been keeping an eye on things — what would you like to dig into?`
      }
    }
    const score = ctx.shopHealthScore ?? '—'
    return `Hey — our shop is at **${score}/100** right now. I've been keeping an eye on a few things. What would you like to dig into?`
  }
  return `I'm here and I know where we are. What would you like to know about our shop?`
}
