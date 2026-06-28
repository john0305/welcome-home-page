import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

const BG    = '#060D1F'
const CARD  = '#0D1929'
const TEAL  = '#00C4AF'
const AMBER = '#F59E0B'
const TEXT  = '#FFFFFF'
const MUTED = '#94A3B8'
const DIM   = '#64748B'
const RED   = '#EF4444'

const DEMO_LIMIT = 2
const DEMO_KEY   = 'radariq_demo_used'

function getDemoUsed(): number {
  try { return parseInt(localStorage.getItem(DEMO_KEY) ?? '0', 10) || 0 } catch { return 0 }
}
function incDemoUsed() {
  try { localStorage.setItem(DEMO_KEY, String(getDemoUsed() + 1)) } catch { /* noop */ }
}

const OPENING = `Hey — I'm Echo, your RadarIQ shop advisor. I've helped sellers find hundreds of missing tags, close pricing gaps, and understand exactly why their listings weren't ranking.

Ask me anything about your Etsy shop. Once you connect and run a grading pass, I'll have your actual data — but I can give you a real sense of what I do right now.`

const SUGGESTIONS = [
  "What's usually hurting Etsy sellers the most?",
  "How do I know if my tags are actually working?",
  "Can you show me what a real fix looks like?",
  "How does Echo learn about my shop over time?",
]

type Msg = { role: 'user' | 'assistant'; content: string }

function EchoAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, rgba(0,196,175,0.55), rgba(0,196,175,0.10) 75%)',
        border: '1px solid rgba(0,196,175,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke={TEAL} strokeWidth="1.4" />
        <circle cx="12" cy="12" r="7" stroke={TEAL} strokeWidth="1" opacity="0.6" />
        <circle cx="12" cy="12" r="11" stroke={TEAL} strokeWidth="0.8" opacity="0.35" />
        <line x1="12" y1="12" x2="22" y2="6" stroke={TEAL} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

const STYLES = `
@keyframes echoFadeIn { from { opacity:0; transform: translateY(6px);} to {opacity:1; transform:translateY(0);} }
@keyframes echoDot { 0%,80%,100% {transform: scale(0.6); opacity:0.4;} 40% {transform: scale(1); opacity:1;} }
.echo-msg { animation: echoFadeIn .35s ease both; }
.echo-dot { animation: echoDot 1.2s infinite ease-in-out; display:inline-block; width:6px; height:6px; border-radius:50%; background:${TEAL}; margin:0 2px;}
.echo-suggestion:hover { border-color:${TEAL} !important; color:${TEXT} !important; }
.echo-textarea:focus { border-color:${TEAL} !important; outline:none; }
`

export function EchoSection() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(() => getDemoUsed() >= DEMO_LIMIT)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending || limitReached) return

    // Client-side gate: check before calling the API
    if (getDemoUsed() >= DEMO_LIMIT) {
      setLimitReached(true)
      return
    }

    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setSending(true)
    incDemoUsed()

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('echo-demo-chat', {
        body: { messages: next },
      })
      if (invokeErr) {
        setError("Echo couldn't connect. Try again in a moment.")
        return
      }
      const payload = data as { reply?: string; error?: string; remaining?: number } | null
      // Server-side rate limit hit
      if (payload?.error === 'rate_limited') {
        setLimitReached(true)
        setMessages((m) => [...m, { role: 'assistant', content: payload.reply ?? "You've seen what Echo can do — sign up free to continue with your real shop data." }])
        return
      }
      const reply = payload?.reply
      if (!reply) {
        setError("Echo couldn't connect. Try again in a moment.")
        return
      }
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
      // If server says remaining === 0, lock the UI
      if (payload?.remaining === 0) setLimitReached(true)
    } catch {
      setError("Echo couldn't connect. Try again in a moment.")
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const showSuggestions = messages.length === 0

  return (
    <section
      id="echo"
      style={{
        padding: '96px 20px 96px',
        marginTop: 0,
        background: 'rgba(13,25,41,0.6)',
        borderTop: '1px solid hsl(var(--border))',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <style>{STYLES}</style>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'rgba(0,196,175,0.10)', borderColor: 'rgba(0,196,175,0.30)', color: TEAL }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#10B981' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#10B981' }} />
            </span>
            Echo · Proprietary AI · Live Demo
          </div>
          <h2
            style={{
              fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
              fontSize: 'clamp(1.8rem,3.5vw,2.6rem)',
              fontWeight: 800,
              color: TEXT,
              marginTop: 16,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Your shop advisor that never clocks out.
          </h2>
          <p
            style={{
              color: MUTED,
              fontSize: '1rem',
              lineHeight: 1.7,
              maxWidth: 560,
              margin: '14px auto 0',
            }}
          >
            Echo is RadarIQ's proprietary AI — built specifically for Etsy sellers, trained on
            ranking signals, and grounded in your actual shop data. It's not a general chatbot.
            It knows your listings, your competitors, and tells you exactly what to fix next.
          </p>
          <p
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              maxWidth: 480,
              margin: '8px auto 0',
            }}
          >
            Ask it anything below. Once your shop is connected, it answers with your real data.
          </p>
        </div>

        {/* Chat window */}
        <div
          style={{
            background: CARD,
            border: '1px solid rgba(0,196,175,0.20)',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,196,175,0.08)',
          }}
        >
          {/* Titlebar */}
          <div
            style={{
              padding: '12px 20px',
              background: 'rgba(6,13,31,0.6)',
              borderBottom: '1px solid hsl(var(--border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <EchoAvatar size={28} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>Echo</p>
                <p style={{ fontSize: 10.5, color: TEAL, marginTop: 2 }}>● Online — RadarIQ Shop Advisor</p>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                color: DIM,
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 999,
                padding: '3px 9px',
                whiteSpace: 'nowrap',
              }}
            >
              Live AI · Not a script
            </span>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              minHeight: 220,
              maxHeight: 340,
              height: 'auto',
              overflowY: 'auto',
              padding: '20px 20px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Opening */}
            <div className="echo-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <EchoAvatar size={28} />
              <div
                style={{
                  background: 'rgba(0,196,175,0.06)',
                  border: '1px solid rgba(0,196,175,0.15)',
                  borderRadius: '4px 16px 16px 16px',
                  padding: '10px 14px',
                  color: '#E2E8F0',
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  maxWidth: '85%',
                }}
              >
                {OPENING}
              </div>
            </div>

            {messages.map((m, i) =>
              m.role === 'assistant' ? (
                <div key={i} className="echo-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <EchoAvatar size={28} />
                  <div
                    style={{
                      background: 'rgba(0,196,175,0.06)',
                      border: '1px solid rgba(0,196,175,0.15)',
                      borderRadius: '4px 16px 16px 16px',
                      padding: '10px 14px',
                      color: '#E2E8F0',
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      maxWidth: '85%',
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  className="echo-msg"
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'flex-end' }}
                >
                  <div
                    style={{
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.20)',
                      borderRadius: '16px 4px 16px 16px',
                      padding: '10px 14px',
                      color: '#FDE68A',
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      maxWidth: '85%',
                    }}
                  >
                    {m.content}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'rgba(245,158,11,0.18)',
                      border: '1px solid rgba(245,158,11,0.4)',
                      color: AMBER,
                      fontWeight: 700,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    Y
                  </div>
                </div>
              ),
            )}

            {sending && (
              <div className="echo-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <EchoAvatar size={28} />
                <div
                  style={{
                    background: 'rgba(0,196,175,0.06)',
                    border: '1px solid rgba(0,196,175,0.15)',
                    borderRadius: '4px 16px 16px 16px',
                    padding: '10px 14px',
                  }}
                >
                  <span className="echo-dot" style={{ animationDelay: '0s' }} />
                  <span className="echo-dot" style={{ animationDelay: '0.15s' }} />
                  <span className="echo-dot" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}

            {error && (
              <p style={{ textAlign: 'center', color: RED, fontSize: 12.5, padding: '8px 0' }}>{error}</p>
            )}

            <div style={{ height: 4 }} />
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid hsl(var(--border))',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: DIM,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginRight: 4,
                }}
              >
                Try asking Echo:
              </span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sending}
                  className="echo-suggestion"
                  style={{
                    fontSize: 11.5,
                    color: MUTED,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 999,
                    padding: '6px 11px',
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input or limit CTA */}
          {limitReached ? (
            <div
              style={{
                padding: '20px 20px',
                borderTop: '1px solid hsl(var(--border))',
                background: 'rgba(6,13,31,0.6)',
                textAlign: 'center',
              }}
            >
              <p style={{ color: 'hsl(var(--foreground))', fontSize: 13.5, marginBottom: 4, fontWeight: 600 }}>
                That's a taste of what Echo can do.
              </p>
              <p style={{ color: MUTED, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Connect your real shop and Echo will analyze your actual listings, tags, and competitors.
              </p>
              <a
                href="/register"
                style={{
                  display: 'inline-block',
                  background: TEAL,
                  color: BG,
                  fontWeight: 700,
                  fontSize: 13.5,
                  padding: '10px 24px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  transition: 'opacity 0.18s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.88')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Get Early Access — It's Free →
              </a>
            </div>
          ) : (
            <div
              style={{
                padding: '14px 16px',
                borderTop: '1px solid hsl(var(--border))',
                background: 'rgba(6,13,31,0.4)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
              }}
            >
              <textarea
                className="echo-textarea"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Echo anything about your Etsy shop…"
                disabled={sending}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'hsl(var(--surface-2))',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 12,
                  color: TEXT,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  padding: '10px 12px',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={sending || !input.trim()}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: input.trim() && !sending ? TEAL : 'rgba(0,196,175,0.15)',
                  border: 'none',
                  color: input.trim() && !sending ? BG : 'rgba(6,13,31,0.5)',
                  cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.18s',
                }}
                aria-label="Send"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <p
          style={{
            fontSize: 11.5,
            color: DIM,
            marginTop: 16,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          This is the real Echo — the same AI that lives in your RadarIQ dashboard. Once your
          shop is connected, Echo knows your actual listings, scores, and competitor data.
        </p>
      </div>
    </section>
  )
}
