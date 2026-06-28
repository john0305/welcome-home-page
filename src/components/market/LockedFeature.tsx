import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Feature } from '@/lib/tier-access'
import { getUpgradePrompt } from '@/lib/tier-access'

interface Props {
  feature: Feature
  tier?: string | null
  /** Blurred preview content to show behind the lock */
  preview?: React.ReactNode
  /** Override the headline */
  headline?: string
  /** Override the CTA label */
  cta?: string
  className?: string
}

export function LockedFeature({ feature, preview, headline, cta, className }: Props) {
  const navigate = useNavigate()
  const prompt = getUpgradePrompt(feature)
  const displayHeadline = headline ?? prompt.headline
  const displayCta = cta ?? prompt.cta

  return (
    <div className={`relative rounded-lg overflow-hidden ${className ?? ''}`}>
      {/* Blurred preview */}
      {preview && (
        <div className="pointer-events-none select-none" aria-hidden="true">
          <div className="opacity-40 blur-sm">
            {preview}
          </div>
        </div>
      )}

      {/* Lock overlay */}
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg px-4 py-3 mt-1.5"
        style={{ background: 'rgba(8, 21, 21, 0.85)', border: '1px solid rgba(0, 196, 175, 0.2)' }}
      >
        <Lock className="h-4 w-4 shrink-0" style={{ color: '#00C4AF' }} />
        <p className="text-xs text-center font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {displayHeadline}
        </p>
        <button
          onClick={() => navigate('/app/choose-plan')}
          className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
          style={{ background: '#00C4AF', color: '#000' }}
        >
          {displayCta} →
        </button>
      </div>
    </div>
  )
}
