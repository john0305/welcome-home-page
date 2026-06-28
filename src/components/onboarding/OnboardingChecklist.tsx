import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp, Lock, ArrowRight, X, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadOnboardingState, completeOnboardingStep } from '@/types/onboarding'
import type { OnboardingStep } from '@/types/onboarding'

const COLLAPSED_KEY = 'radariq_checklist_collapsed'

export function OnboardingChecklist({ onDismiss }: { onDismiss?: () => void }) {
  const navigate = useNavigate()
  const [state, setState] = useState(loadOnboardingState())
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem(COLLAPSED_KEY) === 'true'
  )

  useEffect(() => {
    const refresh = () => setState(loadOnboardingState())
    window.addEventListener('radariq:onboarding-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('radariq:onboarding-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const completedCount = state.steps.filter(s => s.completed).length
  const totalCount = state.steps.filter(s => !s.locked).length
  const pct = Math.round((completedCount / totalCount) * 100)
  const allDone = completedCount === totalCount

  if (state.completed && !allDone) return null

  const toggle = () => {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <div className={cn(
      'relative rounded-xl border overflow-hidden transition-all duration-300',
      allDone
        ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/12 to-emerald-500/6 shadow-[0_4px_24px_rgba(16,185,129,0.08)]'
        : 'border-primary/30 bg-gradient-to-br from-primary/14 to-primary/6 shadow-[0_4px_24px_hsl(var(--primary)/0.12)]'
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {allDone ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                <Trophy className="h-4 w-4 text-emerald-400" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm bg-primary/25 text-primary">
                {completedCount}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {allDone ? '🎉 Setup complete!' : 'Getting started'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {allDone
                  ? "You're all set up and ready to grow."
                  : `${completedCount} of ${totalCount} steps · ${pct}% done`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10"
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            {(allDone || pct >= 60) && onDismiss && (
              <button
                onClick={onDismiss}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-3 h-1 w-full rounded-full overflow-hidden bg-white/6">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out opacity-70"
            style={{
              width: `${pct}%`,
              background: allDone ? '#10b981' : 'hsl(var(--primary))',
            }}
          />
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-0.5">
          {state.steps.map(step => (
            <ChecklistItem
              key={step.id}
              step={step}
              onAction={s => {
                if (s.route) navigate(s.route)
                const newState = completeOnboardingStep(s.id)
                setState(newState)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChecklistItem({ step, onAction }: {
  step: OnboardingStep
  onAction: (step: OnboardingStep) => void
}) {
  const isActionable = !step.completed && !step.locked

  return (
    <button
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-all duration-150',
        step.completed && 'opacity-50',
        step.locked   && 'opacity-35 cursor-not-allowed',
        isActionable  && 'cursor-pointer hover:bg-primary/15',
      )}
      onClick={() => isActionable && onAction(step)}
      disabled={step.locked}
    >
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200"
        style={
          step.completed
            ? { borderColor: '#10b981', background: '#10b981' }
            : step.locked
            ? { borderColor: 'rgba(100,116,139,0.3)', background: 'transparent' }
            : { borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary)/0.1)' }
        }
      >
        {step.completed ? (
          <Check className="h-3 w-3 text-white" />
        ) : step.locked ? (
          <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-xs font-medium',
          step.completed ? 'text-muted-foreground/60 line-through' : 'text-foreground',
        )}>
          {step.title}
        </p>
        {!step.completed && (
          <p className="text-[10px] mt-0.5 text-muted-foreground/60">{step.description}</p>
        )}
      </div>

      {isActionable && (
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {step.xp && (
            <span className="text-[10px] font-semibold text-primary">+{step.xp}</span>
          )}
          <ArrowRight className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      {step.locked && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-primary/15 text-primary">
          Pro
        </span>
      )}
    </button>
  )
}
