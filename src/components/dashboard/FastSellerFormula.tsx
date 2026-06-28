import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useStoreVelocity, type VelocityTrait } from '@/hooks/useStoreVelocity'
import { useAuth } from '@/contexts/AuthContext'

function describeTrait(t: VelocityTrait): string | null {
  if (t.multiplier == null) return null
  const mult = t.multiplier
  switch (t.trait) {
    case 'title_length':
      return mult >= 1.3
        ? `Listings with titles over ${t.threshold ?? 80} characters sell ${mult.toFixed(1)}× faster than shorter ones`
        : null
    case 'tags_count':
      return mult >= 1.1
        ? `Listings using all 13 tags sell ${mult.toFixed(1)}× faster than those with fewer`
        : null
    case 'photo_count':
      return mult >= 1.2
        ? `Listings with ${Math.round(t.fast_avg ?? 10)}+ photos sell ${mult.toFixed(1)}× faster than those with fewer`
        : null
    case 'price':
      return mult >= 1.3
        ? `Listings priced around $${Math.round(t.fast_avg ?? 0)} sell ${mult.toFixed(1)}× faster than your higher-priced items`
        : null
    case 'description_length':
      return mult >= 1.3
        ? `Listings with descriptions over ${t.threshold ?? 500} characters sell ${mult.toFixed(1)}× faster`
        : null
    case 'has_materials':
      return mult >= 1.3
        ? `Listings with the materials field filled sell ${mult.toFixed(1)}× faster`
        : null
    default:
      return null
  }
}

export function FastSellerFormula() {
  const { user } = useAuth()
  const { stats } = useStoreVelocity(user?.id)
  const [open, setOpen] = useState(false)

  if (!stats?.computed_at) return null

  const traits = (stats.fast_seller_traits ?? []).filter(t => (t.sample_size ?? 0) >= 8)
  const lines = traits.map(describeTrait).filter((x): x is string => !!x).slice(0, 5)

  if (lines.length === 0) return null

  return (
    <div className="rounded-xl border" style={{ background: '#0b1a1a', borderColor: 'rgba(148,163,184,0.15)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-semibold text-foreground">Your store's fast-seller formula</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <ul className="space-y-1.5">
            {lines.map((l, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                <span style={{ color: 'hsl(var(--primary))' }}>•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-[11px] italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Based on your store's own sales history — not generic advice.
          </p>
        </div>
      )}
    </div>
  )
}
