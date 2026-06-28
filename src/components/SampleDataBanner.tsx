import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, Lock } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'

const SAMPLE_LISTINGS = [
  { title: 'Handmade Silver Ring — Minimalist Band',           score: 34, grade: 'D',  color: '#ef4444' },
  { title: 'Pressed Flower Resin Earrings — Botanical',         score: 67, grade: 'C+', color: '#f59e0b' },
  { title: 'Macrame Wall Hanging — Boho Home Decor',            score: 82, grade: 'B+', color: '#10b981' },
]

/**
 * Shown on pages that fall back to mock/demo content when the user
 * has not connected a real store yet. Hidden once a store is connected.
 */
export function SampleDataBanner() {
  const { isStoreConnected } = useApp()
  if (isStoreConnected) return null

  return (
    <div className="mb-6 space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl border p-6"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.03))',
          borderColor: 'hsl(var(--primary) / 0.25)',
        }}
      >
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{ background: 'hsl(var(--primary) / 0.12)' }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-widest uppercase mb-3" style={{ background: 'hsl(var(--primary) / 0.12)', borderColor: 'hsl(var(--primary) / 0.25)', color: 'hsl(var(--primary))' }}>
              <Sparkles className="h-3 w-3" />
              Sample data
            </div>
            <h3 className="text-foreground text-lg font-bold mb-1" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              This is what your dashboard will look like
            </h3>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Connect your Etsy store to replace these examples with your real listings, scores, and quick wins.
            </p>
          </div>
          <Link
            to="/app/connect-etsy"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-foreground transition-transform hover:scale-[1.02] active:scale-95 shrink-0"
            style={{ background: '#F26522', boxShadow: '0 8px 24px rgba(242,101,34,0.3)' }}
          >
            Connect Etsy
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Sample listing cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SAMPLE_LISTINGS.map(l => (
          <div
            key={l.title}
            className="relative overflow-hidden rounded-xl border p-4"
            style={{ background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))" }}
          >
            <div
              className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary) / 0.20)' }}
            >
              Sample
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold text-foreground shrink-0"
                style={{ background: l.color }}
              >
                {l.grade}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Score</p>
                <p className="text-lg font-bold text-foreground leading-none" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>{l.score}<span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>/100</span></p>
              </div>
            </div>
            <p className="text-sm font-medium text-foreground line-clamp-2 mb-3 min-h-[2.5rem]">{l.title}</p>
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors cursor-not-allowed"
              style={{ borderColor: "hsl(var(--border))", color: 'hsl(var(--muted-foreground))', background: 'rgba(15,23,42,0.5)' }}
              title="Connect your Etsy store to optimize real listings"
            >
              <Lock className="h-3 w-3" />
              Connect store to optimize
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
