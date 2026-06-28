import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { PageSeo } from '@/components/seo/PageSeo'
import { RadarIcon } from '@/components/layout/Logo'
import { EtsyDisclaimer } from '@/components/EtsyDisclaimer'
import { WaitlistProvider, useWaitlist } from '@/components/landing/WaitlistModal'
import { FoundingCounterPill, PricingFoundingBanner } from '@/components/landing/foundingTiers'
import { FixDemo } from '@/components/landing/FixDemo'
import { EchoSection } from '@/components/landing/EchoSection'
import { FaqSection } from '@/components/landing/FaqSection'
import { PLANS as PAYMENT_PLANS } from '@/lib/payments'
import { supabase } from '@/integrations/supabase/client'
import { ThemeSelector } from '@/components/landing/ThemeSelector'

// ─── A/B-ready headline — swap this object without restructuring the page ────
const HERO_HEADLINE = {
  line1: "Your Etsy listings are invisible.",
  line2: "You don't know why. RadarIQ does.",
}

// ─── Color tokens ────────────────────────────────────────────────────────────
// Resolved at render-time from the active theme's CSS custom properties
// (see src/styles/themes.css). Swapping `data-theme` on <html> retints the
// entire landing page without re-rendering React.
const BG      = 'var(--riq-bg)'
const BG_DEEP = 'var(--riq-bg)'
const CARD    = 'var(--riq-card)'
const TEAL    = 'var(--riq-accent)'
const TEAL_10 = 'color-mix(in srgb, var(--riq-accent) 10%, transparent)'
const TEAL_12 = 'color-mix(in srgb, var(--riq-accent) 12%, transparent)'
const TEAL_15 = 'color-mix(in srgb, var(--riq-accent) 15%, transparent)'
const TEAL_20 = 'color-mix(in srgb, var(--riq-accent) 20%, transparent)'
const TEAL_30 = 'color-mix(in srgb, var(--riq-accent) 30%, transparent)'
const TEAL_35 = 'color-mix(in srgb, var(--riq-accent) 35%, transparent)'
const TEAL_40 = 'color-mix(in srgb, var(--riq-accent) 40%, transparent)'
const AMBER   = '#F59E0B'
const GOLD    = '#D4A843'
const GREEN   = '#10B981'
const RED     = 'hsl(var(--destructive))'
const RED_12  = 'hsl(var(--destructive) / 0.12)'
const TEXT    = 'var(--riq-text)'
const MUTED   = 'var(--riq-muted)'
const DIM     = 'var(--riq-muted)'
const BORDER  = 'var(--riq-border)'

// ─── FIX 3: signups_enabled — module-level 5-minute TTL cache ────────────────
// The cache is shared across all CTAButton instances on the page so the DB is
// queried at most once per 5-minute window per session, regardless of how many
// buttons are mounted.
let _signupsCache: { value: boolean; expiresAt: number } | null = null
const SIGNUPS_TTL_MS = 5 * 60 * 1000   // 5 minutes

function useSignupsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(() => {
    if (_signupsCache && _signupsCache.expiresAt > Date.now()) return _signupsCache.value
    return null
  })
  useEffect(() => {
    // If still within the TTL, skip the fetch entirely.
    if (_signupsCache && _signupsCache.expiresAt > Date.now()) {
      setEnabled(_signupsCache.value)
      return
    }
    ;(async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'signups_enabled')
          .maybeSingle()
        const v = data?.value
        const result = v === true || v === 'true'
        _signupsCache = { value: result, expiresAt: Date.now() + SIGNUPS_TTL_MS }
        setEnabled(result)
      } catch {
        const result = false
        _signupsCache = { value: result, expiresAt: Date.now() + SIGNUPS_TTL_MS }
        setEnabled(result)
      }
    })()
  }, [])
  return enabled
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function CTAButton({
  children, variant = 'primary', planHint, onClick, className = '', testId,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'ghost'
  planHint?: string
  onClick?: () => void
  className?: string
  testId?: string
}) {
  const { open } = useWaitlist()
  const navigate = useNavigate()
  const signupsEnabled = useSignupsEnabled()

  const handle = () => {
    if (onClick) { onClick(); return }
    if (signupsEnabled) { navigate('/register'); return }
    open(planHint)
  }

  if (variant === 'ghost') {
    return (
      <button
        onClick={handle}
        data-testid={testId}
        className={`riq-btn-ghost px-7 py-3.5 rounded-xl font-bold text-sm border ${className}`}
        style={{ borderColor: TEAL, color: TEXT }}>
        {children}
      </button>
    )
  }
  return (
    <button
      onClick={handle}
      data-testid={testId}
      className={`riq-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm ${className}`}
      style={{ background: TEAL, color: BG, boxShadow: `0 12px 36px ${TEAL_40}` }}>
      {children}
    </button>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase"
      style={{ background: TEAL_10, borderColor: TEAL_30, color: TEAL }}>
      {children}
    </div>
  )
}


// Scroll-reveal helper — fades in [data-reveal] children with staggered delay.
function useScrollReveal(stagger = 80) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const els = ref.current?.querySelectorAll('[data-reveal]')
    if (!els || els.length === 0) return
    els.forEach((el) => {
      const h = el as HTMLElement
      h.style.opacity = '0'
      h.style.transform = 'translateY(16px)'
      h.style.transition =
        'opacity 0.45s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.45s cubic-bezier(0.25,0.46,0.45,0.94)'
    })
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const i = Number(el.dataset.revealIdx ?? 0)
            window.setTimeout(() => {
              el.style.opacity = '1'
              el.style.transform = 'translateY(0)'
            }, i * stagger)
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -80px 0px' },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [stagger])
  return ref
}


// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] transition-all"
      style={{
        background: scrolled ? 'rgba(6,13,31,0.90)' : 'rgba(6,13,31,0.40)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: scrolled ? `1px solid ${BORDER}` : '1px solid transparent',
      }}>
      <div className="max-w-7xl mx-auto flex justify-between items-center px-5 md:px-6 py-3.5">
        <Link to="/" className="riq-logo-hover flex items-center gap-2.5 shrink-0">
          <RadarIcon size={28} animated />
          <div>
            <p className="text-sm font-extrabold tracking-tight leading-none" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEXT }}>
              RADAR <span style={{ color: TEAL }}>IQ</span>
            </p>
            <p className="text-[9px] uppercase tracking-[0.18em] mt-0.5" style={{ color: 'rgba(148,163,184,0.55)' }}>For Etsy Sellers</p>
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          <a href="#echo" className="text-sm font-medium transition hover:text-foreground flex items-center gap-1.5" style={{ color: TEAL }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: TEAL }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: TEAL }} />
            </span>
            Echo AI
          </a>
          <a href="#how" className="text-sm font-medium transition hover:text-foreground" style={{ color: MUTED }}>How it works</a>
          <a href="#demo" className="text-sm font-medium transition hover:text-foreground" style={{ color: MUTED }}>Demo</a>
          <a href="#pricing" className="text-sm font-medium transition hover:text-foreground" style={{ color: MUTED }}>Pricing</a>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeSelector />
          <Link
            to="/login"
            data-testid="nav-login-link"
            className="riq-btn-ghost text-sm font-semibold px-3 py-2 sm:px-4 rounded-xl border inline-flex"
            style={{ borderColor: 'hsl(var(--border))', color: TEXT }}>
            Log In
          </Link>
          <CTAButton className="riq-nav-cta !px-5 !py-2.5" testId="nav-cta-button">Start Free →</CTAButton>
        </div>
      </div>
    </nav>
  )
}

// ─── Radar blip positions (relative to 900×900 center at 450,450) ─────────────
// color: teal=opportunity, amber=gap/warning, rose=problem found
const RADAR_BLIPS: { x: number; y: number; label: string; side: 'left' | 'right'; color: string }[] = [
  // Inner ring — stay away from headline center band
  { x: 568, y: 196, label: 'title gap detected',       side: 'right', color: '#F59E0B' },
  { x: 355, y: 265, label: '4 tags missing',            side: 'right', color: '#F59E0B' },
  { x: 162, y: 584, label: 'competitor pulling ahead',  side: 'right', color: '#F87171' },
  { x: 578, y: 603, label: 'photos below avg',          side: 'right', color: '#F59E0B' },
  { x: 786, y: 360, label: 'pricing opportunity',       side: 'left',  color: 'hsl(var(--primary))' },
  // Outer edge — bottom half, clear of nav and headline
  { x: 144, y: 707, label: 'keyword gap found',         side: 'right', color: 'hsl(var(--primary))' },
  { x: 756, y: 707, label: 'views below niche avg',     side: 'left',  color: '#F59E0B' },
  { x: 790, y: 648, label: 'renewal risk detected',     side: 'left',  color: '#F87171' },
]
const BLIP_CYCLE = 16   // seconds per full fade-in/out cycle
const BLIP_STAGGER = BLIP_CYCLE / RADAR_BLIPS.length  // spread evenly

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative flex items-center overflow-hidden"
      style={{ minHeight: '92svh', paddingTop: 'clamp(3rem, 8vw, 5rem)', paddingBottom: '3rem' }}>

      {/* Radar sweep background — clipped to circle at container level so the
          sweep element itself stays rectangular (no stencil on the animated layer) */}
      <div className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          transform: 'translate3d(-50%, -50%, 0)',
          width: 900, height: 900, opacity: 0.35,
          borderRadius: '50%',
          overflow: 'hidden',
        }}>
        <div className="absolute inset-0 rounded-full" style={{ border: `1px solid hsla(var(--primary) / 0.08)` }} />
        <div className="absolute rounded-full" style={{ inset: '15%', border: `1px solid hsla(var(--primary) / 0.10)` }} />
        <div className="absolute rounded-full" style={{ inset: '32%', border: `1px solid hsla(var(--primary) / 0.13)` }} />
        <div className="absolute rounded-full" style={{ inset: '50%', border: `1px solid hsla(var(--primary) / 0.15)` }} />
        <div className="radar-sweep-bg" style={{ position: 'absolute', inset: 0 }} />
      </div>

      {/* Radar blips — separate container so they're not dimmed by the rings' 0.35 opacity */}
      <div className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{ transform: 'translate3d(-50%, -50%, 0)', width: 900, height: 900, zIndex: 1 }}>
        {RADAR_BLIPS.map((b, i) => {
          const delay = `${(i * BLIP_STAGGER).toFixed(1)}s`
          const c = b.color
          // Build rgba from hex for glow — just use the color directly in box-shadow
          const anim = `${BLIP_CYCLE}s ${delay} infinite ease-in-out`
          return (
            <div key={i} style={{ position: 'absolute', left: b.x, top: b.y }}>
              {/* Expand ring — fires once when blip appears */}
              <div style={{
                position: 'absolute',
                width: 8, height: 8,
                borderRadius: '50%',
                border: `1.5px solid ${c}`,
                opacity: 0,
                animation: `radar-find-ring ${anim}`,
              }} />
              {/* Dot */}
              <div style={{
                position: 'absolute',
                width: 8, height: 8,
                borderRadius: '50%',
                background: c,
                boxShadow: `0 0 8px ${c}, 0 0 18px ${c}88`,
                animation: `radar-find-dot ${anim}`,
                opacity: 0,
              }} />
              {/* Label */}
              <div style={{
                position: 'absolute',
                top: '50%',
                ...(b.side === 'right' ? { left: 14 } : { right: 14 }),
                transform: 'translateY(-50%)',
                background: `${c}12`,
                border: `1px solid ${c}30`,
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 9.5,
                fontWeight: 600,
                color: `${c}bb`,
                whiteSpace: 'nowrap',
                letterSpacing: '0.05em',
                animation: `radar-find-label ${anim}`,
                opacity: 0,
                userSelect: 'none',
              }}>
                {b.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full blur-3xl pointer-events-none"
        style={{ background: TEAL_10 }} />

      <div className="max-w-4xl mx-auto px-5 md:px-6 text-center relative z-10 space-y-5">
        {/* Eyebrow */}
        <div className="flex justify-center">
          <SectionEyebrow>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: TEAL }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: TEAL }} />
            </span>
            Market Intelligence for Etsy Sellers
          </SectionEyebrow>
        </div>

        {/* Headline */}
        <h1
          className="leading-[1.06] animate-fade-in"
          style={{
            color: TEXT,
            fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
            fontSize: 'clamp(2.2rem,5vw,4rem)',
            fontWeight: 800,
            letterSpacing: '-0.025em',
          }}
        >
          {HERO_HEADLINE.line1}
          <br />
          <span className="riq-headline-glow" style={{ color: TEAL }}>{HERO_HEADLINE.line2}</span>
        </h1>

        {/* Subheadline */}
        <div className="space-y-3 max-w-2xl mx-auto">
          <p style={{ fontSize: '1.1rem', color: MUTED, lineHeight: 1.65 }}>
            Your competitors know exactly why their listings rank.
            You're guessing. RadarIQ closes that gap.
          </p>
          <p style={{ fontSize: '1.05rem', color: '#CBD5E1', lineHeight: 1.6 }}>
            See your market score, find the gaps, fix them in one click,
            and track whether it worked, all in one place.
          </p>
        </div>

        {/* CTA — pulled close to the value prop */}
        <div className="flex flex-col items-center gap-3 pt-1">
          <CTAButton className="!px-10 !py-4 !text-base" testId="hero-cta-button">
            Get Early Access · It's Free <ArrowRight className="h-5 w-5" />
          </CTAButton>
          <p className="text-xs" style={{ color: DIM }}>
            No credit card required · Founding member pricing locked in during beta
          </p>
        </div>

        {/* Echo teaser pill */}
        <div className="flex justify-center pt-1">
          <a
            href="#echo"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-semibold transition-all hover:border-primary/50 hover:bg-primary/5"
            style={{ borderColor: TEAL_30, background: TEAL_10, color: MUTED }}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: TEAL }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: TEAL }} />
            </span>
            <span>Meet <span style={{ color: TEAL }}>Echo</span> — our proprietary AI that knows your shop</span>
            <ArrowRight className="h-3 w-3" style={{ color: TEAL }} />
          </a>
        </div>

        {/* Waitlist counter */}
        <div className="flex justify-center">
          <FoundingCounterPill />
        </div>
      </div>

      <style>{`
        @keyframes riqHeadlinePulse {
          0%, 100% { text-shadow: 0 0 22px hsla(var(--primary) / 0.20); }
          50%      { text-shadow: 0 0 36px hsla(var(--primary) / 0.55), 0 0 60px hsla(var(--primary) / 0.18); }
        }
        .riq-headline-glow { animation: riqHeadlinePulse 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .riq-headline-glow { animation: none; } }
      `}</style>
    </section>
  )
}

// ─── The Contrast ─────────────────────────────────────────────────────────────
const CONTRAST_PAIRS = [
  {
    label: 'Tag advice',
    bad:  'Your tags could be better.',
    good: "Add these 3 tags. Your top competitors all use them. Add them to your listing right now. We'll do it for you.",
  },
  {
    label: 'Score without meaning',
    bad:  'Your title score is 6.2.',
    good: 'Your title is 27 characters shorter than listings ranking above you. Here\'s a market-informed rewrite. Ready to apply.',
  },
  {
    label: 'Pricing advice',
    bad:  'Consider your pricing strategy.',
    good: "You're priced 34% above your niche. Here's exactly where top sellers cluster, and what they're doing differently.",
  },
  {
    label: 'The follow-through',
    bad:  "Here's your report. Good luck.",
    good: "That tag update 7 days ago improved your market score by 8 points. Here's your next move.",
  },
]

function ContrastSection() {
  const ref = useScrollReveal(80)
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-24 px-5 md:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14 space-y-4">
          <SectionEyebrow>What Makes RadarIQ Different</SectionEyebrow>
          <h2
            className="text-3xl md:text-4xl font-extrabold"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em', color: TEXT }}
          >
            There's a better way to grow on Etsy.
          </h2>
        </div>

        <div className="space-y-4">
          {CONTRAST_PAIRS.map((pair, i) => (
            <div
              key={i}
              data-reveal
              data-reveal-idx={i}
              className="grid md:grid-cols-2 rounded-2xl overflow-hidden border"
              style={{
                borderColor: BORDER,
              }}
            >
              {/* Bad side */}
              <div
                className="p-6 md:p-8 border-b md:border-b-0 md:border-r"
                style={{ background: 'rgba(8,13,20,0.8)', borderColor: BORDER }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="text-base shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full"
                    style={{ background: RED_12 }}
                  >
                    <X className="h-3.5 w-3.5" style={{ color: RED }} />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: DIM }}>Other tools</p>
                    <p className="text-base" style={{ color: 'rgba(148,163,184,0.60)', fontStyle: 'italic' }}>"{pair.bad}"</p>
                  </div>
                </div>
              </div>

              {/* Good side */}
              <div
                className="p-6 md:p-8"
                style={{ background: TEAL_10 }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="text-base shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full"
                    style={{ background: TEAL_15 }}
                  >
                    <Check className="h-3.5 w-3.5" style={{ color: TEAL }} />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: TEAL }}>RadarIQ</p>
                    <p className="text-base font-medium" style={{ color: TEXT, lineHeight: 1.6 }}>"{pair.good}"</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA at peak motivation */}
        <div className="text-center mt-12 space-y-3">
          <p className="text-lg md:text-xl font-semibold" style={{ color: TEXT }}>
            Ready to see what your shop is actually missing?
          </p>
          <div className="flex justify-center pt-1">
            <CTAButton className="!px-8 !py-3.5">
              Get Early Access · It's Free <ArrowRight className="h-4 w-4" />
            </CTAButton>
          </div>
          <p className="text-xs" style={{ color: DIM }}>No credit card required</p>
        </div>
      </div>
    </section>
  )
}

// ─── Product Preview (real screenshots placeholder) ──────────────────────────
function ProductPreview() {
  const ref = useScrollReveal(80)
  const shots = [
    {
      title: 'Dashboard',
      sub: 'Health score, market score, live optimization activity',
      render: () => (
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-full grid place-items-center"
              style={{ background: `conic-gradient(${TEAL} 0 78%, hsl(var(--border)) 78% 100%)` }}>
              <div className="absolute inset-1.5 rounded-full grid place-items-center" style={{ background: CARD }}>
                <div className="text-center">
                  <div className="text-xl font-extrabold leading-none" style={{ color: TEXT }}>78</div>
                  <div className="text-[8px] uppercase tracking-wider" style={{ color: MUTED }}>Health</div>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between text-[10px]" style={{ color: MUTED }}>
                <span>MARKET SCORE</span><span style={{ color: TEAL }}>+12 this week</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                <div className="h-full rounded-full" style={{ width: '62%', background: TEAL }} />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: MUTED }}>
                <span>GRADE DISTRIBUTION</span><span className="text-foreground">285 listings</span>
              </div>
              <div className="flex gap-1 h-1.5">
                {[24,38,30,18,12].map((w,i)=>(
                  <div key={i} className="rounded-full" style={{ width: `${w}%`, background: i<2?TEAL:i<3?AMBER:'hsl(var(--border))' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Optimization activity</div>
            {[
              { t: 'Silver Hoop Earrings', d: '+8 pts · tags updated', c: TEAL },
              { t: 'Boho Pendant Necklace', d: '+5 pts · title rewrite', c: TEAL },
              { t: 'Sterling Ring Set', d: '+3 pts · materials', c: AMBER },
            ].map((r,i)=>(
              <div key={i} className="flex items-center justify-between text-[11px] px-2.5 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="truncate text-foreground">{r.t}</div>
                <div style={{ color: r.c }}>{r.d}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Listing Detail',
      sub: 'SEO grade breakdown · views trend after optimization',
      render: () => (
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg,#1f3a52,#0d1929)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-foreground truncate font-semibold">Hand-Forged Copper Bracelet, Adjustable</div>
              <div className="text-[10px]" style={{ color: MUTED }}>Grade B+ · 142 views / wk</div>
            </div>
            <div className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: TEAL_20, color: TEAL }}>B+</div>
          </div>
          <div className="space-y-1.5">
            {[
              { l: 'Title', v: 92 }, { l: 'Tags', v: 76 }, { l: 'Photos', v: 60 }, { l: 'Description', v: 84 },
            ].map(r => (
              <div key={r.l} className="flex items-center gap-2 text-[10px]">
                <div className="w-20" style={{ color: MUTED }}>{r.l}</div>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                  <div className="h-full rounded-full" style={{ width: `${r.v}%`, background: r.v>80?TEAL:r.v>65?AMBER:RED }} />
                </div>
                <div className="w-8 text-right text-foreground">{r.v}</div>
              </div>
            ))}
          </div>
          <div className="pt-1">
            <div className="flex justify-between text-[10px] mb-1.5">
              <span style={{ color: MUTED }}>Views last 14 days</span>
              <span style={{ color: TEAL }}>+34% post-fix</span>
            </div>
            <svg viewBox="0 0 200 50" className="w-full h-12">
              <polyline fill="none" stroke={TEAL} strokeWidth="2"
                points="0,38 20,36 40,34 60,32 80,30 100,22 120,18 140,14 160,12 180,8 200,6" />
              <line x1="100" y1="0" x2="100" y2="50" stroke="hsla(var(--primary) / 0.3)" strokeDasharray="2 2" />
              <text x="102" y="10" fill={TEAL} fontSize="6">fix applied</text>
            </svg>
          </div>
        </div>
      ),
    },
    {
      title: 'Echo Picks',
      sub: 'Prioritized fixes · estimated point gain · one-click apply',
      render: () => (
        <div className="p-5 space-y-3">
          <div className="flex gap-1.5 text-[10px]">
            {['Echo Picks','Quick Wins','Big Impact'].map((t,i)=>(
              <div key={t} className="px-2.5 py-1 rounded-full" style={{
                background: i===0?TEAL_20:'hsl(var(--surface-2))',
                color: i===0?TEAL:MUTED,
                border: i===0?`1px solid ${TEAL_40}`:'1px solid transparent',
              }}>{t}</div>
            ))}
          </div>
          {[
            { t: 'Add 4 missing tags', l: 'Silver Hoop Earrings', g: '+8' },
            { t: 'Rewrite title for length', l: 'Boho Pendant Necklace', g: '+6' },
            { t: 'Fill materials field', l: 'Sterling Ring Set', g: '+4' },
          ].map((c,i)=>(
            <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-xs font-semibold text-foreground truncate">{c.t}</div>
                <div className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: TEAL_20, color: TEAL }}>{c.g} pts</div>
              </div>
              <div className="text-[10px] mb-2 truncate" style={{ color: MUTED }}>{c.l}</div>
              <button className="text-[10px] font-bold px-3 py-1.5 rounded-md" style={{ background: TEAL, color: BG }}>Apply →</button>
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-16 md:py-20 px-5 md:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 space-y-3">
          <SectionEyebrow>What it actually looks like</SectionEyebrow>
          <h2 className="text-2xl md:text-3xl font-extrabold text-foreground"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Your shop's command center.
          </h2>
        </div>

        <div className="-mx-5 md:mx-0 px-5 md:px-0 overflow-x-auto snap-x snap-mandatory">
          <div className="flex gap-4 md:grid md:grid-cols-3 md:gap-5 pb-2">
            {shots.map((s, i) => (
              <div key={s.title} data-reveal data-reveal-idx={i}
                className="snap-center shrink-0 w-[88%] md:w-auto rounded-2xl overflow-hidden flex flex-col"
                style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
                {/* Faux window chrome */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: BORDER, background: 'rgba(255,255,255,0.02)' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: RED }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: AMBER }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: GREEN }} />
                  <span className="ml-2 text-[10px]" style={{ color: DIM }}>radariq.app · {s.title}</span>
                </div>
                <div className="flex-1">{s.render()}</div>
                <div className="px-4 py-3 border-t" style={{ borderColor: BORDER, background: 'rgba(0,0,0,0.2)' }}>
                  <p className="text-xs font-semibold text-foreground">{s.title}</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>{s.sub}</p>
                  <a href="/register" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold transition-opacity hover:opacity-80" style={{ color: TEAL }}>
                    Try it live →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-8 space-y-3 max-w-2xl mx-auto">
          <p className="text-sm md:text-base" style={{ color: '#CBD5E1', lineHeight: 1.6 }}>
            This is your shop's command center. Everything you see is specific to your store. No templates, not generic advice.
          </p>
          <div className="flex justify-center pt-1">
            <CTAButton className="!px-7 !py-3">
              See it for your shop <ArrowRight className="h-4 w-4" />
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── How RadarIQ Works ───────────────────────────────────────────────────────
const HOW_STEPS = [
  {
    n: '01', label: 'See it',
    body: 'Connect your shop. In 60 seconds we scan your market, find your real competitors, and show you exactly where you stand, not just as a score, but as a real position in your niche right now.',
    outcome: 'Most sellers see their first insight in under 2 minutes.',
  },
  {
    n: '02', label: 'Understand it',
    body: "Every insight is specific to your actual market. Not keyword databases. Not generic advice. What's winning for your exact search terms today and the specific gaps between them and you.",
    outcome: 'Every recommendation is pulled from your actual niche, not a keyword database.',
  },
  {
    n: '03', label: 'Fix it',
    body: "We don't just tell you what to change. For most optimizations, we make the change directly to your Etsy listing with one click. You approve everything. You can undo anything. Always.",
    outcome: 'One click. You review. You approve. Nothing goes to Etsy without you.',
  },
  {
    n: '04', label: 'Track it',
    body: 'Seven days after every change, we tell you whether it worked. Score improved — here\'s why. Stayed flat — here\'s what to try next. No guessing.',
    outcome: 'We tell you if it worked — even if it didn\'t.',
  },
]

function HowItWorks() {
  const ref = useScrollReveal(70)
  return (
    <section id="how" ref={ref as React.RefObject<HTMLElement>} className="py-16 md:py-20 px-5 md:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8 space-y-3">
          <SectionEyebrow>How RadarIQ Works</SectionEyebrow>
          <h2 className="text-2xl md:text-3xl font-extrabold text-foreground"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Built around one simple loop.
          </h2>
        </div>
        <div className="grid gap-3 md:gap-4 md:grid-cols-2">
          {HOW_STEPS.map((s, i) => (
            <div key={s.n} data-reveal data-reveal-idx={i}
              className="rounded-2xl p-5 md:p-6"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-extrabold"
                  style={{ background: TEAL_15, color: TEAL, border: `1px solid ${TEAL_40}` }}>
                  {s.n}
                </div>
                <p className="text-xs uppercase font-bold tracking-widest" style={{ color: TEAL }}>{s.label}</p>
              </div>
              <p className="text-sm" style={{ color: '#CBD5E1', lineHeight: 1.6 }}>{s.body}</p>
              <p className="text-xs mt-3 italic" style={{ color: MUTED }}>{s.outcome}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Testimonials ────────────────────────────────────────────────────────────
function TestimonialsSection() {
  const ref = useScrollReveal(80)
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-16 md:py-20 px-5 md:px-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div data-reveal data-reveal-idx={0}
          className="rounded-2xl p-6 md:p-8"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <blockquote className="text-lg md:text-xl font-semibold leading-snug"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEXT }}>
            "I had no idea 152 of my listings were missing tags. RadarIQ found it in minutes and fixed them with one click."
          </blockquote>
          <div className="mt-4 text-sm" style={{ color: MUTED }}>
            <span style={{ color: TEXT, fontWeight: 600 }}>RAVEfindsbyCC</span>, Vintage &amp; Collectibles Seller
            <span className="block text-xs mt-0.5" style={{ color: DIM }}>Beta member since launch</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              '152 missing tags found in one scan',
              'Store health score visible in under 5 minutes',
              'Zero listing changes made without approval',
            ].map(s => (
              <span key={s} className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                style={{ background: TEAL_12, color: TEAL, border: `1px solid ${TEAL_30}` }}>{s}</span>
            ))}
          </div>
        </div>

        <div data-reveal data-reveal-idx={1}
          className="rounded-2xl p-6 md:p-8"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <blockquote className="text-lg md:text-xl font-semibold leading-snug"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEXT }}>
            "Finally a tool that doesn't just show me scores — it tells me exactly what to change and does it for me."
          </blockquote>
          <div className="mt-4 text-sm" style={{ color: MUTED }}>
            <span style={{ color: TEXT, fontWeight: 600 }}>Beta member</span>, Handmade Jewelry Seller
            <span className="block text-xs mt-0.5" style={{ color: MUTED }}>Early access member</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {['One-click optimizations', 'No changes without approval', 'Health score visible in minutes'].map(s => (
              <span key={s} className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                style={{ background: TEAL_12, color: TEAL, border: `1px solid ${TEAL_30}` }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}


// ─── Honesty Section ──────────────────────────────────────────────────────────



function HonestySection() {
  const ref = useScrollReveal(60)
  const PUNCHES = [
    "We'll tell you when something isn't working, even if it's our own recommendation.",
    'If the algorithm changes, we update our model. We\'d rather be honest about a gap.',
    'We measure our success by one thing: whether your shop is actually growing.',
  ]
  const SUPPORT = [
    "Most tools are built to keep you subscribed. We're built to get you results.",
    "Your data keeps working for you on every plan. When you upgrade, your history is already waiting.",
    "We add features our users actually ask for. Not features that look good on a pricing page.",
    "If it's not growing, that's our problem to solve — not yours to figure out alone.",
  ]
  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className="py-16 md:py-20 px-5 md:px-6"
      style={{ background: TEAL }}
    >
      <div className="max-w-3xl mx-auto text-center space-y-7">
        <SectionEyebrow>
          <span style={{ color: BG }}>Our Commitment to You</span>
        </SectionEyebrow>

        <blockquote
          className="font-extrabold leading-tight"
          style={{
            fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
            fontSize: 'clamp(1.6rem,4vw,2.6rem)',
            color: BG,
            letterSpacing: '-0.02em',
          }}
        >
          "Your success is literally<br />how we measure ours."
        </blockquote>

        <h2
          className="text-2xl md:text-3xl font-extrabold"
          style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: BG }}
        >
          We built this differently.
        </h2>

        {/* Three punches with supporting copy interleaved */}
        <div className="space-y-5 text-left">
          {PUNCHES.map((p, i) => (
            <div key={i} data-reveal data-reveal-idx={i} className="space-y-2">
              <p
                style={{
                  fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
                  fontSize: 'clamp(1.15rem,2.5vw,1.4rem)',
                  fontWeight: 800,
                  color: BG,
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                }}
              >
                {p}
              </p>
              {SUPPORT[i] && (
                <p style={{ fontSize: 14, color: 'rgba(6,13,31,0.72)', lineHeight: 1.65 }}>
                  {SUPPORT[i]}
                </p>
              )}
            </div>
          ))}
          {SUPPORT[3] && (
            <p data-reveal data-reveal-idx={4}
              style={{ fontSize: 14, color: 'rgba(6,13,31,0.72)', lineHeight: 1.65, textAlign: 'center', paddingTop: 8 }}>
              {SUPPORT[3]}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

// SocialProofSection removed — will return with real testimonials


// ─── Pricing ──────────────────────────────────────────────────────────────────
// Prices sourced from payments.ts — single source of truth.
// price_yearly is read and displayed when the user toggles to yearly billing.
type LandingPlan = {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  tagline: string
  features: string[]
  popular?: boolean
  foundingNote?: string
}

const TAGLINES: Record<string, string> = {
  free:    'A real starting point. No card needed.',
  starter: 'More listings. More data. More momentum.',
  pro:     'Everything. For shops that mean business.',
}

// Only show Free/Starter/Pro on the landing page (Agency is B2B/outbound).
const PLANS: LandingPlan[] = PAYMENT_PLANS
  .filter(p => p.id === 'free' || p.id === 'starter' || p.id === 'pro')
  .map(p => ({
    id:            p.id.charAt(0).toUpperCase() + p.id.slice(1), // 'Free' | 'Starter' | 'Pro'
    name:          p.name.toUpperCase(),
    price_monthly: p.price_monthly,
    price_yearly:  p.price_yearly,
    tagline:       TAGLINES[p.id] ?? p.description,
    features:      p.features,
    popular:       p.id === 'starter',
    foundingNote:  p.id !== 'free' ? 'Founding member pricing, locked in for life' : undefined,
  }))

function PricingSection() {
  const [yearly, setYearly] = useState(false)
  const { open } = useWaitlist()

  return (
    <section id="pricing" className="py-24 px-5 md:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4 space-y-4">
          <SectionEyebrow>Currently in Beta</SectionEyebrow>
          <h2
            className="text-3xl md:text-4xl font-extrabold"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em', color: TEXT }}
          >
            Pricing that grows with you.
          </h2>
          <p className="max-w-xl mx-auto text-sm md:text-base" style={{ color: MUTED }}>
            We believe you should see real value before you pay.
            That's why our free plan actually does something useful.
          </p>
        </div>

        {/* FIX 1: Yearly toggle — fully wired to price_yearly from payments.ts */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <button
            onClick={() => setYearly(false)}
            data-testid="billing-toggle-monthly"
            className="text-sm font-semibold transition"
            style={{ color: yearly ? MUTED : TEXT }}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(y => !y)}
            data-testid="billing-toggle-switch"
            className="relative w-12 h-6 rounded-full transition"
            style={{ background: yearly ? TEAL : 'hsl(var(--border))' }}
            aria-label={yearly ? 'Switch to monthly billing' : 'Switch to yearly billing'}
            aria-pressed={yearly}
          >
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: yearly ? '26px' : '2px' }} />
          </button>
          <button
            onClick={() => setYearly(true)}
            data-testid="billing-toggle-yearly"
            className="text-sm font-semibold transition"
            style={{ color: yearly ? TEXT : MUTED }}
          >
            Yearly{' '}
            <span
              className="text-[10px] font-bold ml-1 px-1.5 py-0.5 rounded"
              style={{ background: `${GREEN}20`, color: GREEN }}
            >
              Save ~20%
            </span>
          </button>
        </div>

        {/* On mobile, Pro first */}
        <div className="grid gap-5 md:grid-cols-3" data-testid="pricing-grid">
          {/* Order: Free → Starter → Pro (top-to-bottom on mobile, left-to-right on desktop) */}
          {PLANS.map(plan => {
            // FIX 1: show yearly price when toggle is on
            const displayPrice = yearly ? plan.price_yearly : plan.price_monthly
            const isStarter = plan.id === 'Starter'
            const isPro = plan.id === 'Pro'
            const isFree = plan.id === 'Free'

            const cardBorder = isStarter ? `2px solid ${TEAL}` : `1px solid ${BORDER}`
            const cardBg = isStarter
              ? `linear-gradient(180deg, ${TEAL_10}, ${CARD} 60%)`
              : CARD
            const cardShadow = isStarter ? `0 20px 60px ${TEAL_20}` : 'none'

            const ctaPrimary = isStarter || isFree
            const badge = isStarter
              ? { text: 'MOST POPULAR', bg: AMBER, color: '#000' }
              : isPro
                ? { text: 'For serious sellers', bg: 'hsl(var(--border))', color: MUTED }
                : null

            return (
              <div
                key={plan.id}
                data-testid={`pricing-card-${plan.id.toLowerCase()}`}
                className="riq-card-hover rounded-2xl p-6 flex flex-col relative"
                style={{ background: cardBg, border: cardBorder, boxShadow: cardShadow }}
              >
                {badge && (
                  <div
                    className="absolute top-0 right-4 -translate-y-1/2 text-[10px] font-bold px-3 py-1 rounded-full"
                    style={{ background: badge.bg, color: badge.color, border: isPro ? `1px solid ${BORDER}` : 'none' }}
                  >
                    {badge.text}
                  </div>
                )}

                <p className="text-xs uppercase font-bold tracking-widest mb-1"
                  style={{ color: isStarter ? TEAL : MUTED }}>{plan.name}</p>
                <p className="text-sm mb-5 leading-snug" style={{ color: '#CBD5E1' }}>{plan.tagline}</p>

                <div className="mb-6">
                  <span className="text-4xl font-extrabold" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEXT }}>
                    ${displayPrice}
                  </span>
                  <span className="text-sm" style={{ color: MUTED }}>
                    {yearly && displayPrice > 0 ? '/mo, billed yearly' : '/mo'}
                  </span>
                </div>

                <ul className="space-y-2.5 mb-6 flex-grow">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-snug" style={{ color: f.startsWith('No credit card') ? DIM : '#CBD5E1' }}>
                      <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: TEAL }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.foundingNote && (
                  <p className="text-[10px] font-semibold mb-4 text-center"
                    style={{ color: AMBER }}>
                    {plan.foundingNote}
                  </p>
                )}

                <button
                  data-testid={`pricing-cta-${plan.id.toLowerCase()}`}
                  onClick={() => open(plan.id)}
                  className={`${ctaPrimary ? 'riq-btn-primary' : 'riq-btn-ghost'} w-full py-3 rounded-xl font-bold text-sm`}
                  style={ctaPrimary
                    ? { background: TEAL, color: BG, boxShadow: `0 10px 30px ${TEAL_40}` }
                    : { border: `1px solid ${BORDER}`, color: TEXT, background: 'transparent' }
                  }
                >
                  {isFree ? 'Start Free →' : `Start ${plan.name} →`}
                </button>
                {isFree && (
                  <p className="text-[10px] text-center mt-2" style={{ color: DIM }}>No credit card needed</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-sm" style={{ color: MUTED }}>No contracts. Cancel anytime.</p>
          <p className="text-sm" style={{ color: MUTED }}>Your data stays yours, always exportable.</p>
          <p className="text-sm mt-4" style={{ color: DIM }}>
            Questions before signing up?{' '}
            <a href="mailto:hello@radariq.app" className="transition hover:text-foreground" style={{ color: TEAL }}>
              hello@radariq.app
            </a>
            {' '}— we actually respond.
          </p>
        </div>

        <PricingFoundingBanner />
      </div>
    </section>
  )
}

// ─── Bottom CTA ───────────────────────────────────────────────────────────────
function BottomCTA() {
  return (
    <section className="py-16 px-5 md:px-6" style={{ background: BG_DEEP }}>
      <div className="max-w-2xl mx-auto text-center space-y-7 relative">
        {/* Ambient glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'rgba(0,196,175,0.12)' }} />

        <div className="relative z-10 space-y-7">
          <h2
            className="text-3xl md:text-4xl font-extrabold text-foreground leading-tight"
            style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}
          >
            Your shop deserves better than guesswork.
          </h2>

          <div className="space-y-4 text-base" style={{ color: '#CBD5E1', lineHeight: 1.75 }}>
            <p>
              RadarIQ is in active beta with real Etsy sellers.
              Every feature you see was built from actual seller feedback, including yours the moment you join.
            </p>
            <p className="font-medium" style={{ color: TEXT }}>
              We're not building for the algorithm.
              We're building for you.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <CTAButton className="!px-10 !py-4 !text-base" testId="bottom-cta-button">
              Get Early Access, Start Free <ArrowRight className="h-5 w-5" />
            </CTAButton>
            <FoundingCounterPill />
            <p className="text-xs text-center" style={{ color: DIM }}>
              Free plan available · No credit card required · Founding member pricing locked in at signup
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-12 px-5 md:px-6 border-t" style={{ background: BG_DEEP, borderColor: BORDER }}>
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-6 text-center">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <RadarIcon size={24} />
          <span className="font-extrabold text-base text-foreground tracking-tight" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            RADAR <span style={{ color: TEAL }}>IQ</span>
          </span>
        </div>

        {/* Nav links */}
        <div className="flex flex-wrap justify-center gap-5 text-sm" style={{ color: MUTED }}>
          <Link to="/privacy" className="hover:text-foreground transition">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition">Terms</Link>
          <a href="mailto:hello@radariq.app" className="hover:text-foreground transition">Contact</a>
        </div>

        <p className="text-sm" style={{ color: MUTED }}>hello@radariq.app</p>

        <div className="border-t w-full pt-6 space-y-2" style={{ borderColor: BORDER }}>
          <p className="text-xs" style={{ color: DIM }}>
            © 2026 RadarIQ. Built for sellers, not shareholders.{' '}
            <span style={{ color: GOLD }}>🇺🇸 Service-Disabled Veteran-Owned</span>
          </p>
        </div>

        <div className="w-full max-w-xl">
          <EtsyDisclaimer variant="inline" />
        </div>
      </div>
    </footer>
  )
}

// ─── Stats strip (kept — strong trust signals) ────────────────────────────────
function StatsBar() {
  const ref = useScrollReveal(100)
  const stats = [
    { v: '60s', l: 'to see your real market position after connecting' },
    { v: '285', l: 'listings analyzed in a single beta shop scan' },
    { v: '7 days', l: 'tracked after every change you make' },
    { v: '0', l: 'listing changes pushed without your approval, ever' },
  ]
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-12 border-y" style={{ background: 'rgba(13,25,41,0.5)', borderColor: BORDER }}>
      <div className="max-w-6xl mx-auto px-5 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={s.l} data-reveal data-reveal-idx={i} className="text-center">
              <p className="text-2xl md:text-3xl font-extrabold mb-1"
                style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', color: TEAL }}>{s.v}</p>
              <p className="text-xs leading-snug" style={{ color: MUTED }}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ─────────────────────────────────────────────────────────
export default function Landing() {
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  return (
    <WaitlistProvider>
      <PageSeo
        title="RadarIQ — Market Intelligence for Etsy Sellers"
        description="RadarIQ shows you why your Etsy listings are invisible — then fixes it. See your market score, close the gaps, and track what actually moves the needle. Free to start."
        path="/"
      />
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap" rel="stylesheet" />
      <div className="riq-landing-root" style={{ background: BG, fontFamily: 'var(--riq-font-body)', color: MUTED, minHeight: '100vh', overflowX: 'hidden' }}>
        <Nav />
        <main id="main-content">
          {/* 1. Hero */}
          <Hero />
          {/* 2. Stats strip */}
          <StatsBar />
          {/* 3. Product preview — what it actually looks like */}
          <ProductPreview />
          {/* 4. Echo — our proprietary AI shop advisor (live demo) */}
          <EchoSection />
          {/* 5. How RadarIQ Works — the four-step loop */}
          <HowItWorks />
          {/* 6. Contrast — what makes RadarIQ different (peak persuasion + CTA) */}
          <ContrastSection />
          {/* 7. Interactive fix demo */}
          <div id="demo"><FixDemo /></div>
          {/* 8. Testimonials */}
          <TestimonialsSection />
          {/* 9. FAQ — trust and OAuth concerns */}
          <FaqSection />
          {/* 10. Honesty section */}
          <HonestySection />
          {/* 11. Pricing */}
          <PricingSection />
          {/* 12. Bottom CTA */}
          <BottomCTA />
        </main>
        <Footer />
      </div>
    </WaitlistProvider>
  )
}
