import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

const TEAL = '#00C4AF'
const GOLD = '#D4A843'
const MUTED = '#94A3B8'

const FOUNDING_CAP = 50
const VISIBLE_THRESHOLD = 25

// Polling interval for anonymous landing page visitors.
// 60 s is fine — the counter doesn't need sub-second freshness
// and avoids holding a persistent WebSocket per visitor.
const POLL_INTERVAL_MS = 60_000

export type WaitlistStats = { total: number; founding: number; loading: boolean }

// Module-level shared store so multiple components on the same page share
// one polling interval and one in-memory state, not a per-component fetch.
let _stats: WaitlistStats = { total: 0, founding: 0, loading: true }
const _listeners = new Set<(s: WaitlistStats) => void>()
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _initialized = false

async function _load() {
  try {
    const { data, error } = await (supabase as any).rpc('get_waitlist_stats')
    if (!error && data) {
      _stats = { total: Number(data.total ?? 0), founding: Number(data.founding ?? 0), loading: false }
    } else {
      _stats = { ..._stats, loading: false }
    }
  } catch {
    _stats = { ..._stats, loading: false }
  }
  _listeners.forEach(fn => fn(_stats))
}

function _ensurePolling() {
  if (_initialized) return
  _initialized = true
  _load()
  _pollTimer = setInterval(_load, POLL_INTERVAL_MS)
}

export function useWaitlistStats(): WaitlistStats {
  const [stats, setStats] = useState<WaitlistStats>(_stats)
  useEffect(() => {
    _ensurePolling()
    _listeners.add(setStats)
    setStats(_stats)
    return () => { _listeners.delete(setStats) }
  }, [])
  return stats
}

export function FoundingCounterPill() {
  const { total, founding, loading } = useWaitlistStats()
  if (loading || total < VISIBLE_THRESHOLD) return null
  const full = founding >= FOUNDING_CAP
  return (
    <div
      data-testid="founding-counter-pill"
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border counter-pulse"
      style={{
        background: full ? 'rgba(245,158,11,0.10)' : 'rgba(0,196,175,0.10)',
        borderColor: full ? 'rgba(245,158,11,0.35)' : 'rgba(0,196,175,0.35)',
        color: full ? '#F59E0B' : TEAL,
      }}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: full ? '#F59E0B' : TEAL }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: full ? '#F59E0B' : TEAL }} />
      </span>
      {full
        ? 'Founding Pro spots are full — join the waitlist for 15% off your first 12 months'
        : <>{Math.min(founding, FOUNDING_CAP)} of {FOUNDING_CAP} founding Pro spots claimed</>}
      <style>{`
        @keyframes counterPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,196,175,0.0); } 50% { box-shadow: 0 0 0 4px rgba(0,196,175,0.08); } }
        .counter-pulse { animation: counterPulse 2.6s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

export function FoundingTiersList({ compact = false }: { compact?: boolean }) {
  const items = [
    { icon: '⭐', text: <><span className="text-white font-semibold">First 50 Pro founders</span> — 20% off forever</> },
    { icon: '🎯', text: <><span className="text-white font-semibold">Signups 51–200</span> — 15% off for your first 12 months</> },
    { icon: '✦',  text: <><span className="text-white font-semibold">All other waitlist members</span> — one free month at launch</> },
  ]
  return (
    <ul className={`space-y-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: MUTED }}>
      {items.map((it, i) => (
        <li key={i} className="riq-tier-row flex items-start gap-2 leading-snug">
          <span style={{ color: TEAL }} className="shrink-0">{it.icon}</span>
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function FoundingTiersBlock() {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'rgba(0,196,175,0.05)', borderColor: 'rgba(0,196,175,0.20)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: TEAL }}>
        Founding Member spots are limited
      </p>
      <p className="text-[11px] mb-3 leading-snug" style={{ color: MUTED }}>
        Your position in line determines your discount:
      </p>
      <FoundingTiersList />
    </div>
  )
}

export function PricingFoundingBanner() {
  return (
    <div className="mt-10 rounded-2xl p-6 md:p-7"
      style={{ background: 'rgba(0,196,175,0.06)', border: `1px solid rgba(0,196,175,0.30)`, boxShadow: `0 20px 60px ${TEAL}10` }}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl">🇺🇸</span>
        <div>
          <h3 className="text-white font-extrabold text-base md:text-lg" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Founding Member Pricing — <span style={{ color: GOLD }}>Limited Spots</span>
          </h3>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>
        <li className="riq-tier-row flex items-start gap-2"><span style={{ color: TEAL }}>⭐</span><span><span className="text-white font-semibold">First 50 Pro waitlist members</span> lock in 20% off forever.</span></li>
        <li className="riq-tier-row flex items-start gap-2"><span style={{ color: TEAL }}>🎯</span><span><span className="text-white font-semibold">Next 200 members</span> get 15% off for 12 months.</span></li>
        <li className="riq-tier-row flex items-start gap-2"><span style={{ color: TEAL }}>✦</span><span><span className="text-white font-semibold">All waitlist members</span> receive one free month at launch.</span></li>
      </ul>
      <p className="text-xs mt-4" style={{ color: MUTED }}>
        Your position in line is your discount — join now to secure your tier.
      </p>
    </div>
  )
}

export { FOUNDING_CAP, VISIBLE_THRESHOLD }
