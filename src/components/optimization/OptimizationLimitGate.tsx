/**
 * OptimizationLimitGate
 *
 * Wraps any "Run optimization" action for free-tier users.
 * Shows results first, then hits them with the ceiling WHILE they can see the value.
 *
 * Strategy: don't block upfront — let them use their last credit,
 * then show the upgrade prompt right after they see the grade improvement.
 */

import { useState } from 'react'
import { Sparkles, Zap, ArrowRight, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useOptimizationUsage } from '@/hooks/useOptimizationUsage'

const FREE_MONTHLY_LIMIT = 10

// Deprecated — kept only so existing call sites don't break.
// Server is the source of truth (consume_optimization RPC); this is a no-op.
export function incrementOptimizationUsage() {
  // intentionally empty
}

// ─── Ceiling Banner ───────────────────────────────────────────────────────────
// Persistent bar shown in the optimization queue / listing detail once at 4/5
export function OptimizationUsageBanner() {
  const { user } = useAuth()
  const { used, limit, isAtLimit, isNearLimit } = useOptimizationUsage()

  if (user?.tier !== 'free' || (!isNearLimit && !isAtLimit)) return null

  return (
    <div className={`rounded-lg border p-3 ${isAtLimit ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className={`h-4 w-4 ${isAtLimit ? 'text-red-500' : 'text-amber-600'}`} />
            <p className={`text-sm font-semibold ${isAtLimit ? 'text-red-800' : 'text-amber-900'}`}>
              {isAtLimit
                ? `You've used all ${limit} free optimizations this month`
                : `${limit - used} optimization${limit - used === 1 ? '' : 's'} left this month`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Progress
              value={(used / limit) * 100}
              className={`h-1.5 flex-1 max-w-[140px] ${isAtLimit ? '[&>div]:bg-red-500' : '[&>div]:bg-amber-500'}`}
            />
            <span className={`text-xs font-medium ${isAtLimit ? 'text-red-700' : 'text-amber-700'}`}>
              {used}/{limit}
            </span>
          </div>
        </div>
        <Link to="/app/settings?tab=billing">
          <Button size="sm" className="gap-1.5 shrink-0 bg-primary/15 hover:bg-primary/15">
            <Zap className="h-3.5 w-3.5" />
            Upgrade for unlimited
          </Button>
        </Link>
      </div>
    </div>
  )
}

// ─── Post-optimization upgrade modal ─────────────────────────────────────────
// Shown right AFTER completing the last free optimization — when they can see results
interface PostOptimizationUpgradeProps {
  open: boolean
  onClose: () => void
  gradeImprovement?: number
  newGrade?: number
}

function nextMonthReset(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

export function PostOptimizationUpgrade({ open, onClose, gradeImprovement, newGrade }: PostOptimizationUpgradeProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <TrendingUp className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            {gradeImprovement
              ? `Your listing just improved by ${gradeImprovement} points!`
              : "Optimization complete!"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {newGrade
              ? `New grade: ${newGrade}/100`
              : 'Great result — now imagine doing this for all your listings automatically.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border-2 border-primary bg-primary/15 p-4 text-center">
            <p className="text-lg font-bold text-primary">You've used all 10 free optimizations</p>
            <p className="text-sm text-primary mt-1">Your free month resets {nextMonthReset()}.</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Upgrade to Pro and get:</p>
            {[
              'Unlimited AI optimizations — no monthly cap',
              'Nightly auto-runs for your whole shop',
              'Full analytics & grade correlation',
              'Google Analytics integration',
            ].map(f => (
              <div key={f} className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                {f}
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-3">
              Pro is <strong>$39/month</strong> — typically covered by selling 1 extra item.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link to="/app/settings?tab=billing" onClick={onClose}>
            <Button className="w-full gap-2 bg-primary/15 hover:bg-primary/15">
              <Zap className="h-4 w-4" />
              Upgrade to Pro — $39/month
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            I'll wait until next month
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Inline upgrade nudge (shown on the optimize button itself) ──────────────
export function OptimizeButtonWithGate({
  onClick,
  loading,
  disabled,
  className,
}: {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}) {
  const { user } = useAuth()
  const { used, limit, isAtLimit, isNearLimit } = useOptimizationUsage()
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (user?.tier !== 'free') {
    return (
      <Button onClick={onClick} disabled={disabled || loading} className={className}>
        <Sparkles className="h-4 w-4 mr-1.5" />
        {loading ? 'Optimizing...' : 'AI Optimize'}
      </Button>
    )
  }

  if (isAtLimit) {
    return (
      <>
        <Button
          onClick={() => setShowUpgrade(true)}
          variant="outline"
          className={`border-primary text-primary hover:bg-primary/15 ${className ?? ''}`}
        >
          <Zap className="h-4 w-4 mr-1.5" />
          Upgrade to optimize
          <Badge className="ml-2 bg-primary/15 text-primary border-0 text-[10px]">0 left</Badge>
        </Button>
        <PostOptimizationUpgrade
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
        />
      </>
    )
  }

  return (
    <Button onClick={onClick} disabled={disabled || loading} className={className}>
      <Sparkles className="h-4 w-4 mr-1.5" />
      {loading ? 'Optimizing...' : 'AI Optimize'}
      {isNearLimit && (
        <Badge className="ml-2 bg-amber-100 text-amber-700 border-0 text-[10px]">
          {limit - used} left
        </Badge>
      )}
    </Button>
  )
}
