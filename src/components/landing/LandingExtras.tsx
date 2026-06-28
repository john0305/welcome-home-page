import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BarChart3, Check, MessageSquare, Sparkles, X, Zap } from 'lucide-react'

// ─── shared in-view hook ─────────────────────────────────────────────────────
function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!ref.current || inView) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setInView(true)),
      { threshold }
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [inView, threshold])
  return { ref, inView }
}

const TEAL = '#00C4AF'
const PANEL = "hsl(var(--surface-1))"
const BORDER = "hsl(var(--border))"

// ─── 1. Social Proof Bar ─────────────────────────────────────────────────────
export function SocialProofBar() {
  const stats = [
    { value: '12,400+', label: 'Listings analyzed by Radar IQ' },
    { value: '+38 pts', label: 'Average grade lift per optimization' },
    { value: '< 5 min', label: 'Average setup, from signup to first score' },
    { value: '0', label: 'Listing changes pushed without your approval' },
  ]
  return (
    <section className="py-12 border-y" style={{ background: 'rgba(8,21,21,0.4)', borderColor: 'hsl(var(--surface-2))' }}>
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(s => (
          <div key={s.label} className="text-center md:text-left">
            <p className="text-3xl md:text-4xl font-extrabold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEAL }}>
              {s.value}
            </p>
            <p className="text-xs md:text-sm mt-1.5 leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 2. Research vs Execution ────────────────────────────────────────────────
export function ResearchVsExecution() {
  const research = [
    'Keyword volume charts',
    'Competitor tag lists',
    'Trend reports for the whole marketplace',
    'Generic SEO suggestions you still have to act on',
  ]
  const execution = [
    'Reads every listing in your shop, tonight',
    'Rewrites titles, tags and descriptions for your specific products',
    'Ranks tomorrow\'s queue by what will actually move your sales',
    'You approve. We push the changes live to Etsy.',
  ]
  return (
    <section className="py-24" style={{ background: "hsl(var(--background))" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase mb-4" style={{ background: 'rgba(0, 196, 175,0.10)', borderColor: 'rgba(0, 196, 175,0.30)', color: TEAL }}>
            Different by design
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Most tools give you research. Radar IQ does the work.
          </h2>
          <p className="max-w-2xl mx-auto text-sm md:text-base" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Other Etsy tools hand you more data. Radar IQ turns your shop's data into specific, shop-aware actions you can ship today.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl p-7 border" style={{ background: PANEL, borderColor: BORDER }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>Research tools</p>
            <h3 className="text-xl font-bold text-foreground mb-5" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>What you get</h3>
            <ul className="space-y-3">
              {research.map(r => (
                <li key={r} className="flex items-start gap-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(148,163,184,0.12)' }}>
                    <X className="h-3 w-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-7 border relative overflow-hidden" style={{ background: PANEL, borderColor: 'rgba(0, 196, 175,0.35)' }}>
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(0, 196, 175,0.18)' }} />
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: TEAL }}>Radar IQ</p>
            <h3 className="text-xl font-bold text-foreground mb-5" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>What we do</h3>
            <ul className="space-y-3 relative">
              {execution.map(r => (
                <li key={r} className="flex items-start gap-3 text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0, 196, 175,0.18)' }}>
                    <Check className="h-3 w-3" style={{ color: TEAL }} />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center mt-10 text-lg md:text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          You approve. <span style={{ color: TEAL }}>We execute.</span> You sell more.
        </p>
      </div>
    </section>
  )
}

// ─── 3. Echo Demo (animated conversation) ────────────────────────────────────
type DemoMsg = { role: 'user' | 'echo'; text: string; typingMs?: number }
const ECHO_SCRIPT: DemoMsg[] = [
  { role: 'user', text: 'Which of my listings is slipping this week?' },
  { role: 'echo', text: '"Vintage Faux Canary Necklace" lost 22% of its search impressions in the last 7 days. Two of your tags fell out of the top results: "vintage bird jewelry" and "yellow statement necklace".', typingMs: 1400 },
  { role: 'user', text: 'What should I do about it?' },
  { role: 'echo', text: 'Rewrite the title to lead with "Canary Yellow Statement Necklace", swap the two stale tags for "boho bird pendant" and "spring jewelry gift", and add a short scene in the description about everyday wear. Want me to draft it for your review?', typingMs: 1800 },
]

export function EchoDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35)
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!inView || step >= ECHO_SCRIPT.length) return
    const cur = ECHO_SCRIPT[step]
    const delay = cur.role === 'echo' ? (cur.typingMs ?? 1200) : 700
    if (cur.role === 'echo') setTyping(true)
    const t = setTimeout(() => {
      setTyping(false)
      setStep(s => s + 1)
    }, delay)
    return () => clearTimeout(t)
  }, [inView, step])

  const visible = ECHO_SCRIPT.slice(0, step)

  return (
    <section className="py-24" style={{ background: 'rgba(8,21,21,0.4)' }}>
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-5 gap-12 items-center">
        <div className="md:col-span-2 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase" style={{ background: 'rgba(0, 196, 175,0.10)', borderColor: 'rgba(0, 196, 175,0.30)', color: TEAL }}>
            <MessageSquare className="h-3 w-3" /> Meet Echo
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Ask anything about your shop. Get a real answer.
          </h2>
          <p className="text-sm md:text-base leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Echo sees what your shop did yesterday, last week and last quarter — and tells you exactly what to do next. No dashboards to learn.
          </p>
        </div>
        <div className="md:col-span-3">
          <div ref={ref} className="rounded-2xl border p-5 md:p-6 relative overflow-hidden" style={{ background: PANEL, borderColor: BORDER, minHeight: 420 }}>
            <div className="flex items-center gap-2 mb-5 pb-4 border-b" style={{ borderColor: BORDER }}>
              <div className="w-2 h-2 rounded-full" style={{ background: TEAL, boxShadow: `0 0 12px ${TEAL}` }} />
              <p className="text-xs font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>Echo</p>
              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>· live conversation</p>
            </div>
            <div className="space-y-3">
              {visible.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                    style={
                      m.role === 'user'
                        ? { background: 'rgba(0, 196, 175,0.15)', color: 'hsl(var(--foreground))', border: '1px solid rgba(0, 196, 175,0.25)' }
                        : { background: '#0a1c1c', color: 'hsl(var(--foreground))', border: `1px solid ${BORDER}` }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start animate-fade-in">
                  <div className="rounded-2xl px-4 py-3 flex items-center gap-1.5" style={{ background: '#0a1c1c', border: `1px solid ${BORDER}` }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full echo-dot" style={{ background: TEAL, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <style>{`
              @keyframes echoDot { 0%,80%,100%{opacity:.25;transform:translateY(0)} 40%{opacity:1;transform:translateY(-3px)} }
              .echo-dot { animation: echoDot 1.1s infinite ease-in-out; }
            `}</style>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Score Transformation (circular arcs) ────────────────────────────────────
function ScoreArc({ score, label, color, sublabel }: { score: number; label: string; color: string; sublabel: string }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(${color} 0% ${pct}%, hsl(var(--border)) ${pct}% 100%)` }}
        />
        <div
          className="absolute inset-2 rounded-full flex flex-col items-center justify-center"
          style={{ background: "hsl(var(--background))" }}
        >
          <p className="text-3xl font-extrabold text-foreground leading-none" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{score}</p>
          <p className="text-[10px] font-bold mt-1" style={{ color }}>{label}</p>
        </div>
      </div>
      <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{sublabel}</p>
    </div>
  )
}

function ScoreTransformation() {
  return (
    <div className="mb-12">
      <div className="flex items-center justify-center gap-6 md:gap-10 flex-wrap">
        <ScoreArc score={41} label="GRADE F" color="#EF4444" sublabel="Before RadarIQ" />
        <div className="flex flex-col items-center gap-1">
          <span
            className="text-sm font-extrabold px-3 py-1 rounded-full"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEAL, background: 'rgba(0,196,175,0.12)', border: `1px solid rgba(0,196,175,0.30)` }}
          >
            +43 pts
          </span>
          <svg width="64" height="20" viewBox="0 0 64 20" fill="none" aria-hidden>
            <path d="M2 10 H56 M48 4 L58 10 L48 16" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <ScoreArc score={84} label="GRADE B" color={TEAL} sublabel="After optimization" />
      </div>
      <p className="text-center mt-5 text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Same shop. Same listings. Different results.
      </p>
    </div>
  )
}

// ─── 4. Listing Transformation ───────────────────────────────────────────────
export function ListingTransformation() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3)
  return (
    <section className="py-24" style={{ background: "hsl(var(--background))" }}>
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            What an optimization actually looks like
          </h2>
          <p className="max-w-2xl mx-auto text-sm md:text-base" style={{ color: 'hsl(var(--muted-foreground))' }}>
            A real listing from a real shop. Same product, same photos — different words, different result.
          </p>
        </div>
        <ScoreTransformation />
        <div className="grid md:grid-cols-2 gap-5 relative">
          <TransformCard
            label="Before"
            grade={37}
            title="Soy candle eucalyptus travel size handmade"
            desc="Handmade soy wax travel candle with eucalyptus scent. Small size. Great gift."
            tags={['soy candle', 'handmade candle', 'travel candle', 'eucalyptus', 'small candle', 'scented candle', 'candle gift', 'wax candle']}
            tone="muted"
            visible={inView}
            delay={0}
          />
          <TransformCard
            label="After"
            grade={84}
            title="Eucalyptus Cedar Soy Travel Candle — Handmade Stress Relief Gift, Small Batch Aromatherapy Candle, Minimalist Home Scent"
            desc="A clean, grounding pour of eucalyptus and cedar in a palm-sized tin — built for the desk, the suitcase, or the bedside nightstand. Hand-poured in small batches, clean-burning, ready to gift."
            tags={['eucalyptus soy candle', 'travel size candle', 'stress relief gift', 'aromatherapy candle', 'minimalist home decor', 'small batch candle', 'cedar scented candle', 'gift for her', 'desk candle', 'meditation candle', 'housewarming gift', 'clean burning candle', 'handpoured candle']}
            tone="teal"
            visible={inView}
            delay={400}
          />
          {inView && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:flex"
              style={{ animation: 'fadeInUp 0.6s 1.1s both' }}
            >
              <div className="px-5 py-2 rounded-full text-sm font-extrabold text-foreground shadow-2xl" style={{ background: TEAL, boxShadow: `0 12px 36px ${TEAL}66`, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                +47 pts
              </div>
            </div>
          )}
        </div>
        <p className="text-center mt-8 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          You review every word before it touches your shop.
        </p>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform:translate(-50%, -30%) scale(.9) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
        `}</style>
      </div>
    </section>
  )
}

function TransformCard({
  label, grade, title, desc, tags, tone, visible, delay,
}: {
  label: string; grade: number; title: string; desc: string; tags: string[]
  tone: 'muted' | 'teal'; visible: boolean; delay: number
}) {
  const isTeal = tone === 'teal'
  return (
    <div
      className="rounded-2xl p-6 border transition-all"
      style={{
        background: PANEL,
        borderColor: isTeal ? 'rgba(0, 196, 175,0.35)' : BORDER,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity .6s ${delay}ms ease, transform .6s ${delay}ms ease`,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isTeal ? TEAL : '#64748b' }}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Grade</span>
          <span className="px-2 py-0.5 rounded-md text-sm font-extrabold" style={{
            fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
            background: isTeal ? 'rgba(0, 196, 175,0.15)' : 'rgba(239,68,68,0.12)',
            color: isTeal ? TEAL : '#f87171',
          }}>{grade}</span>
        </div>
      </div>
      <h4 className="text-foreground font-bold text-sm mb-3 leading-snug" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{title}</h4>
      <p className="text-xs leading-relaxed mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="text-[10px] px-2 py-1 rounded-md" style={{
            background: isTeal ? 'rgba(0, 196, 175,0.10)' : 'rgba(148,163,184,0.08)',
            color: isTeal ? TEAL : '#94a3b8',
            border: `1px solid ${isTeal ? 'rgba(0, 196, 175,0.20)' : 'rgba(148,163,184,0.12)'}`,
          }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 5. Morning Queue ────────────────────────────────────────────────────────
export function MorningQueue() {
  const items = [
    {
      rank: 1,
      title: '"Handwoven Linen Tea Towel — Sage" needs a title rewrite',
      impact: 'Est. +12 visits/wk',
      reason: 'Lost 18% search impressions over 14 days · 3 tags are duplicates',
      icon: Sparkles,
    },
    {
      rank: 2,
      title: 'Refresh tags on "Brass Botanical Bookmark Set of 3"',
      impact: 'Est. +6 visits/wk',
      reason: '4 tags rank below page 5 · 2 strong keywords missing',
      icon: BarChart3,
    },
    {
      rank: 3,
      title: 'Description for "Soy Wax Travel Candle" is below 160 chars',
      impact: 'Lift conversion ~3%',
      reason: 'Short descriptions convert 31% worse on average for your category',
      icon: Zap,
    },
  ]
  return (
    <section className="py-24" style={{ background: 'rgba(8,21,21,0.4)' }}>
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-5 gap-12 items-center">
        <div className="md:col-span-2 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase" style={{ background: 'rgba(0, 196, 175,0.10)', borderColor: 'rgba(0, 196, 175,0.30)', color: TEAL }}>
            Pro · Nightly automation
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Wake up to your shop's next move, already ranked.
          </h2>
          <p className="text-sm md:text-base leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Every night Radar IQ re-scans your shop, scores every listing, and builds tomorrow's queue. You sip coffee and click Review.
          </p>
        </div>
        <div className="md:col-span-3 rounded-2xl border p-5 md:p-6" style={{ background: PANEL, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-5 pb-4 border-b" style={{ borderColor: BORDER }}>
            <div>
              <p className="text-xs font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>This morning's queue</p>
              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Generated overnight · ranked by estimated impact</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(0, 196, 175,0.12)', color: TEAL }}>3 ready</span>
          </div>
          <div className="space-y-3">
            {items.map(it => (
              <div key={it.rank} className="rounded-xl border p-4 flex gap-4 items-start" style={{ background: '#0a1c1c', borderColor: BORDER }}>
                <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-extrabold text-sm" style={{ background: 'rgba(0, 196, 175,0.12)', color: TEAL, fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                  {it.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-bold text-foreground leading-snug truncate" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{it.title}</p>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(0, 196, 175,0.10)', color: TEAL, border: '1px solid rgba(0, 196, 175,0.20)' }}>
                      {it.impact}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{it.reason}</p>
                  <div className="flex gap-2">
                    <button className="text-xs font-bold px-3 py-1.5 rounded-md inline-flex items-center gap-1" style={{ background: TEAL, color: "hsl(var(--background))" }}>
                      Review <ArrowRight className="h-3 w-3" />
                    </button>
                    <button className="text-xs font-bold px-3 py-1.5 rounded-md border" style={{ borderColor: BORDER, color: 'hsl(var(--muted-foreground))' }}>
                      Later
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
