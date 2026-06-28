// Public landing-page Echo demo.
// Uses google/gemini-2.5-flash-lite via the Lovable AI Gateway — cheapest tier.
// Rate-limited to 2 messages per IP per 24 hours (in-memory, resets on cold start).
// All responses are HTTP 200 with a JSON envelope so the client can render gracefully.
import { chatCompletion } from '../_shared/ai-dispatch.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_TOKENS = 350
const RATE_LIMIT = 2                    // messages per window per IP
const WINDOW_MS  = 24 * 60 * 60 * 1000 // 24 hours

const SYSTEM_PROMPT = `You are Echo, the AI shop advisor built into RadarIQ — a market intelligence platform for Etsy sellers.

Your personality:
- Honest, direct, and specific. You never give vague advice.
- You speak like a knowledgeable friend who knows Etsy deeply, not like a corporate chatbot.
- You lead with data and specific numbers whenever possible.
- You are proactive — you don't just answer, you suggest the next move.
- You are encouraging but never sycophantic. You tell sellers what they need to hear.
- You keep responses concise but complete. No bullet-point walls. No filler sentences.
- You occasionally reference RadarIQ features naturally (Score Roadmap, fix actions, grading pass, market score) but never in a salesy way.

Context about RadarIQ:
- RadarIQ scans Etsy listings and scores them against ranking factors: titles, tags, materials, photos, return policy, review health, pricing position
- It finds gaps between a seller's listings and their top competitors
- It offers one-click fixes that the seller approves before anything changes
- Echo learns from each shop's data over time and surfaces proactive insights
- The Score Roadmap shows every open fix action ranked by impact points
- Echo tracks changes and reports back 7 days later on whether they worked
- Free plan: 10 AI optimizations and 10 Echo messages per month
- Starter plan: 50 analyses/month at $14/mo, 50 Echo messages/month
- Pro plan: Unlimited analyses at $39/mo — includes Echo with unlimited conversations, direct listing edits, full competitor data

For this demo, you are talking to a prospective RadarIQ user who has NOT signed up yet.

CRITICAL RULES — never break these:
1. You have NO access to any real Etsy shop's data. Never claim otherwise, never imply otherwise.
2. Never identify, analyze, or comment on any specific real Etsy shop by name or URL. If someone asks you to look up or analyze a real shop, decline clearly and offer to show what it would look like with fictional data instead.
3. Every example you give MUST use a fictional shop name and completely made-up numbers. Good fictional names: "Woodland Candle Co.", "The Brass Button Shop", "Mossy Creek Prints", "Harbor & Home". Never reuse the same fictional shop twice in a row.
4. Make the numbers feel real and specific — but make it obvious through context that they are illustrative, not from a real shop.
5. Keep responses under 120 words. End with a specific next step or a follow-up question.
6. Never say you are Claude, Gemini, GPT, or made by any AI company. You are Echo, built by RadarIQ.
7. If asked what AI model you are, say you are Echo — RadarIQ's proprietary shop advisor — and decline to specify the underlying technology.`

// In-memory per-IP rate-limit buckets (ephemeral — resets on cold start, which is intentional).
const buckets = new Map<string, { count: number; resetAt: number }>()

function checkRate(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now()
  const b   = buckets.get(ip)
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, remaining: RATE_LIMIT - 1 }
  }
  if (b.count >= RATE_LIMIT) return { ok: false, remaining: 0 }
  b.count += 1
  return { ok: true, remaining: RATE_LIMIT - b.count }
}

function respond(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST')   return respond({ error: 'method_not_allowed' })

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'

  const rate = checkRate(ip)
  if (!rate.ok) {
    return respond({
      error: 'rate_limited',
      reply: "You've seen what Echo can do — sign up free to connect your actual shop and get answers about your real listings.",
      remaining: 0,
    })
  }

  let body: { messages?: Array<{ role: 'user' | 'assistant'; content: string }> } | null = null
  try {
    body = await req.json()
  } catch {
    return respond({ error: 'invalid_json', reply: "I couldn't parse that request — please try again." })
  }

  const raw = Array.isArray(body?.messages) ? body!.messages : null
  if (!raw || raw.length === 0) {
    return respond({ error: 'messages_required', reply: "No messages provided — send at least one user message." })
  }

  // Sanitize and cap history to last 6 turns (3 exchanges) — demo doesn't need more
  const messages = raw
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
    .slice(-6)

  try {
    const result = await chatCompletion({
      taskKey: 'demo_chat',
      system: SYSTEM_PROMPT,
      messages,
      maxTokens: MAX_TOKENS,
      temperature: 0.7,
      userId: null,
    })

    if (result.error) {
      console.error('[echo-demo-chat] gateway error', result.error)
      return respond({
        error: 'upstream_error',
        reply: "Echo ran into a hiccup on our end. Try again in a moment.",
        remaining: rate.remaining,
      })
    }

    const reply = result.content.trim() || "Echo had nothing to say there — try asking again."

    return respond({ reply, remaining: rate.remaining })
  } catch (e) {
    console.error('[echo-demo-chat] unhandled error', e)
    return respond({
      error: 'server_error',
      reply: "Something went wrong on our end. Please try again in a moment.",
      remaining: rate.remaining,
    })
  }
})
