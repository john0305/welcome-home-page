import { useEffect, useRef, useState } from 'react'
import { RadarIcon } from '@/components/layout/Logo'

const TEAL = '#00C4AF'
const CARD = '#0D1929'
const BORDER = 'hsl(var(--border))'

type Msg = { role: 'user' | 'echo'; text: string }
type Convo = { label: string; messages: Msg[] }

const CONVOS: Convo[] = [
  {
    label: 'Jewelry Seller',
    messages: [
      { role: 'user', text: "Why isn't my copper bracelet getting views?" },
      { role: 'echo', text: "Your listing scores 41/100. You're missing 5 high-value tags your category uses right now, have only 3 photos when 10 is optimal, and your description has no measurements — critical for bracelet buyers. Want me to fix the tags and description now?" },
      { role: 'user', text: 'Yes fix them' },
      { role: 'echo', text: 'Done. I added: copper cuff bracelet, penny jewelry, coin bracelet, boho jewelry, wrist cuff. Your tag score went from 16/25 to 23/25. I also noticed your photos show the bracelet on a wrist but your description doesn\'t mention fit or sizing. Want me to add that?' },
    ],
  },
  {
    label: 'Digital Seller',
    messages: [
      { role: 'user', text: 'My printable wedding planner has 200 favorites but no sales' },
      { role: 'echo', text: 'High favorites with low sales almost always means price hesitation or unclear value in the cover photo. Your cover shows the planner closed — buyers can\'t see what\'s inside. Listings with open mockup covers convert 20–35% better for digital planners. Want me to rewrite your description to bridge the gap while you update the photo?' },
    ],
  },
  {
    label: 'Vintage Seller',
    messages: [
      { role: 'user', text: 'Which of my listings should I focus on this week?' },
      { role: 'echo', text: 'Your 1970s ceramic lamp has 847 views and zero sales in 30 days — that\'s your biggest opportunity. The title buries the era and style. Your vintage pyrex bowl set has your best conversion rate at 4.2%. Want me to rewrite the lamp title using the same formula that\'s working for the pyrex set?' },
    ],
  },
]

export function EchoChatTabs() {
  const [tab, setTab] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const convo = CONVOS[tab]

  useEffect(() => {
    setVisibleCount(0)
    setTyping(false)
    let cancelled = false
    let i = 0
    const next = () => {
      if (cancelled) return
      if (i >= convo.messages.length) return
      const m = convo.messages[i]
      if (m.role === 'echo') {
        setTyping(true)
        setTimeout(() => {
          if (cancelled) return
          setTyping(false)
          setVisibleCount(c => c + 1)
          i++
          setTimeout(next, 700)
        }, 1100)
      } else {
        setTimeout(() => {
          if (cancelled) return
          setVisibleCount(c => c + 1)
          i++
          next()
        }, 500)
      }
    }
    const t = setTimeout(next, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [tab, convo])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [visibleCount, typing])

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
      {/* tabs */}
      <div className="flex border-b" style={{ borderColor: BORDER }}>
        {CONVOS.map((c, i) => (
          <button
            key={c.label}
            onClick={() => setTab(i)}
            className={`riq-echo-tab ${tab === i ? 'riq-echo-tab-active' : ''} flex-1 text-[11px] md:text-xs font-semibold py-3 px-2 relative`}
            style={{
              color: tab === i ? TEAL : '#94A3B8',
              background: tab === i ? 'rgba(0,196,175,0.06)' : 'transparent',
            }}
          >
            {c.label}
            {tab === i && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: TEAL }} />
            )}
          </button>
        ))}
      </div>

      {/* chat header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: BORDER }}>
        <div className="w-2 h-2 rounded-full" style={{ background: TEAL, boxShadow: `0 0 10px ${TEAL}` }} />
        <p className="text-xs font-bold text-white" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>Echo</p>
        <p className="text-[10px]" style={{ color: '#64748B' }}>· connected to your shop</p>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 320, minHeight: 200 }}>
        {convo.messages.slice(0, visibleCount).map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {typing && (
          <div className="flex items-end gap-2 animate-fade-in">
            <Avatar />
            <div className="rounded-2xl px-3.5 py-2.5 flex items-center gap-1.5" style={{ background: '#0a1729', border: `1px solid ${BORDER}` }}>
              {[0,1,2].map(i => (
                <span key={i} className="h-1.5 w-1.5 rounded-full echo-dot" style={{ background: TEAL, animationDelay: `${i*0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* disabled composer (visual only) */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t" style={{ borderColor: BORDER, background: '#0a1322' }}>
        <div
          className="flex-1 rounded-lg px-3 py-2 text-[12px] select-none"
          style={{ background: '#0a1729', border: `1px solid ${BORDER}`, color: 'hsl(var(--muted-foreground))' }}
          aria-disabled="true"
        >
          Ask Echo anything about your shop...
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 cursor-not-allowed"
          style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--muted-foreground))', border: `1px solid ${BORDER}` }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4Z" />
          </svg>
        </button>
      </div>
      <style>{`
        @keyframes echoDot { 0%,80%,100%{opacity:.25;transform:translateY(0)} 40%{opacity:1;transform:translateY(-3px)} }
        .echo-dot { animation: echoDot 1.1s infinite ease-in-out; }
      `}</style>
    </div>
  )
}

function Avatar() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,196,175,0.15)' }}>
      <RadarIcon size={18} />
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex items-end gap-2 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <Avatar />}
      <div
        className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
        style={isUser
          ? { background: 'rgba(0,196,175,0.15)', color: '#E2E8F0', border: '1px solid rgba(0,196,175,0.25)' }
          : { background: '#0a1729', color: '#CBD5E1', border: `1px solid ${BORDER}` }
        }
      >
        {msg.text}
      </div>
    </div>
  )
}
