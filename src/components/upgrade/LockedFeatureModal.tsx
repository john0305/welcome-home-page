import { useNavigate } from 'react-router-dom'
import { Crown, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { LucideIcon } from 'lucide-react'

export interface LockedFeature {
  label: string
  description: string
  requiredTier: 'starter' | 'pro' | 'agency'
  icon: LucideIcon
}

interface LockedFeatureModalProps {
  feature: LockedFeature | null
  onClose: () => void
}

export function LockedFeatureModal({ feature, onClose }: LockedFeatureModalProps) {
  const navigate = useNavigate()
  const open = !!feature
  if (!feature) return null
  const tierLabel = feature.requiredTier.charAt(0).toUpperCase() + feature.requiredTier.slice(1)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-primary/20 bg-surface-1">
        <div className="flex flex-col items-center text-center py-2">
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-primary/15 border border-primary/30">
              <feature.icon className="h-8 w-8 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full flex items-center justify-center bg-amber-500">
              <Crown className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-foreground mb-1.5">{feature.label}</h2>
          <p className="text-sm max-w-sm text-muted-foreground">{feature.description}</p>

          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-amber-500/10 border-amber-500/30 text-amber-400">
            <Crown className="h-3 w-3" />
            Available on {tierLabel} plan
          </div>

          <button
            onClick={() => { onClose(); navigate('/app/settings') }}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-background bg-primary transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] shadow-[0_8px_24px_hsl(var(--primary)/0.3)]"
          >
            Upgrade to {tierLabel}
            <ArrowRight className="h-4 w-4" />
          </button>

          <button onClick={onClose} className="mt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
