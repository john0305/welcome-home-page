/**
 * Etsy API v3 Rate Limiter
 *
 * Limits:
 *   - 10 requests/second (per API key)
 *   - 50,000 requests/day (per API key)
 *   - Burst: up to 25 requests in quick succession
 *
 * Strategy: Token bucket + request queue + exponential backoff on 429s.
 * All Etsy API calls should go through this wrapper.
 */

import { sleep } from './utils'

interface QueuedRequest<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  retries: number
  priority: 'high' | 'normal' | 'low'
}

const MAX_PER_SECOND = 10
const MAX_PER_DAY = 50_000
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 1000

export class EtsyRateLimiter {
  private queue: QueuedRequest<unknown>[] = []
  private processing = false
  private tokens = MAX_PER_SECOND
  private requestsToday = 0
  private lastRefillTime = Date.now()
  private dailyResetTime = this.getNextMidnight()
  private onQuotaWarning?: (remaining: number) => void

  constructor(options?: { onQuotaWarning?: (remaining: number) => void }) {
    this.onQuotaWarning = options?.onQuotaWarning
  }

  async execute<T>(fn: () => Promise<T>, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<T> {
    if (this.requestsToday >= MAX_PER_DAY) {
      throw new Error(`Etsy API daily quota exceeded (${MAX_PER_DAY} requests/day). Resets at midnight.`)
    }

    if (this.requestsToday > MAX_PER_DAY * 0.9 && this.onQuotaWarning) {
      this.onQuotaWarning(MAX_PER_DAY - this.requestsToday)
    }

    return new Promise((resolve, reject) => {
      const item: QueuedRequest<T> = { fn, resolve: resolve as (v: T) => void, reject, retries: 0, priority }

      // Insert by priority
      if (priority === 'high') {
        const idx = this.queue.findIndex(q => q.priority !== 'high')
        this.queue.splice(idx === -1 ? this.queue.length : idx, 0, item as QueuedRequest<unknown>)
      } else {
        this.queue.push(item as QueuedRequest<unknown>)
      }

      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      this.refillTokens()
      this.checkDailyReset()

      if (this.tokens <= 0) {
        await sleep(100) // wait for token refill
        continue
      }

      const item = this.queue.shift()!
      this.tokens--
      this.requestsToday++

      try {
        const result = await item.fn()
        item.resolve(result)
      } catch (err: unknown) {
        const status = (err as { response?: { status: number; headers?: Record<string, string> } })?.response?.status
        const headers = (err as { response?: { headers?: Record<string, string> } })?.response?.headers

        if (status === 429) {
          // Rate limited — respect Retry-After header
          const retryAfter = parseInt(headers?.['retry-after'] ?? '60', 10)
          console.warn(`Etsy 429 rate limit. Waiting ${retryAfter}s before retry.`)

          if (item.retries < MAX_RETRIES) {
            item.retries++
            await sleep(retryAfter * 1000)
            this.queue.unshift(item) // re-queue at front
          } else {
            item.reject(new Error(`Etsy rate limit exceeded after ${MAX_RETRIES} retries`))
          }
        } else if (status === 503 || status === 504) {
          // Transient server error — exponential backoff
          if (item.retries < MAX_RETRIES) {
            item.retries++
            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, item.retries)
            await sleep(delay)
            this.queue.push(item)
          } else {
            item.reject(err)
          }
        } else {
          item.reject(err)
        }
      }

      // Throttle: small delay between requests to stay under burst limits
      await sleep(100)
    }

    this.processing = false
  }

  private refillTokens() {
    const now = Date.now()
    const elapsed = now - this.lastRefillTime
    const tokensToAdd = Math.floor(elapsed / 1000) * MAX_PER_SECOND
    if (tokensToAdd > 0) {
      this.tokens = Math.min(MAX_PER_SECOND, this.tokens + tokensToAdd)
      this.lastRefillTime = now
    }
  }

  private checkDailyReset() {
    if (Date.now() >= this.dailyResetTime) {
      this.requestsToday = 0
      this.dailyResetTime = this.getNextMidnight()
    }
  }

  private getNextMidnight(): number {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime()
  }

  get stats() {
    return {
      queueLength: this.queue.length,
      tokens: this.tokens,
      requestsToday: this.requestsToday,
      dailyRemaining: MAX_PER_DAY - this.requestsToday,
      dailyUsedPct: Math.round((this.requestsToday / MAX_PER_DAY) * 100),
    }
  }
}

// Singleton for the app — all Etsy calls go through this
export const etsyLimiter = new EtsyRateLimiter({
  onQuotaWarning: (remaining) => {
    console.warn(`Etsy API quota warning: ${remaining} requests remaining today`)
  },
})

// ─── Batch helper: spread requests over time to avoid hitting limits ──────────
// Use when syncing many listings at once.
export async function batchEtsyRequests<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  batchSize = 5,
  delayBetweenBatches = 600 // ms — keeps us well under 10/sec
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(item => etsyLimiter.execute(() => fn(item)))
    )
    results.push(...batchResults)
    if (i + batchSize < items.length) await sleep(delayBetweenBatches)
  }

  return results
}

// ─── Pagination helper: auto-paginate Etsy list endpoints ────────────────────
export async function paginateEtsy<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ results: T[]; count: number }>,
  options: { limit?: number; maxPages?: number; onPage?: (items: T[], page: number) => void } = {}
): Promise<T[]> {
  const limit = options.limit ?? 100
  const maxPages = options.maxPages ?? 50 // safety cap
  const all: T[] = []
  let offset = 0
  let page = 0

  while (page < maxPages) {
    const data = await etsyLimiter.execute(() => fetchPage(offset, limit))
    const items = data.results ?? []
    all.push(...items)
    options.onPage?.(items, page)

    if (items.length < limit) break // last page
    offset += limit
    page++
    await sleep(200) // be polite between pages
  }

  return all
}
