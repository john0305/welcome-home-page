export interface OnboardingStep {
  id: string
  title: string
  description: string
  route?: string
  completed: boolean
  locked?: boolean  // can't do until previous steps done
  reward?: string   // text shown on completion
  xp?: number       // gamification points
}

export interface OnboardingState {
  completed: boolean
  currentStep: number
  steps: OnboardingStep[]
  storeHealthScore: number | null
  quickWins: QuickWin[]
  showHealthScan: boolean
}

export interface QuickWin {
  id: string
  title: string
  impact: 'high' | 'medium' | 'low'
  effort: 'quick' | 'medium' | 'involved'
  description: string
  action_label: string
  action_route: string
  estimated_grade_gain?: number
}

export const ONBOARDING_STEPS: Omit<OnboardingStep, 'completed'>[] = [
  {
    id: 'create_account',
    title: 'Create your account',
    description: 'You\'re in! Welcome aboard Radar IQ.',
    reward: '🎉 Welcome aboard!',
    xp: 10,
  },
  {
    id: 'connect_store',
    title: 'Connect your Etsy store',
    description: 'Authorize Radar IQ to read your listings.',
    route: '/app/connect-etsy',
    reward: 'Store connected!',
    xp: 20,
  },
  {
    id: 'view_health_score',
    title: 'See your Store Health Score',
    description: 'Get your baseline grade across all listings.',
    route: '/app/dashboard',
    reward: 'You know where you stand!',
    xp: 10,
  },
  {
    id: 'first_optimization',
    title: 'Run your first optimization',
    description: 'Pick any listing and let AI rewrite it.',
    route: '/app/listings',
    reward: '✨ Your first optimization!',
    xp: 30,
  },
  {
    id: 'personalize_ai',
    title: 'Personalize your AI',
    description: 'Tell Radar IQ about your brand voice — 2 minutes.',
    route: '/app/store-profile',
    reward: 'AI now writes in your voice!',
    xp: 20,
  },
  {
    id: 'setup_automation',
    title: 'Set up nightly optimization runs',
    description: 'Never manually schedule again. (Pro)',
    route: '/app/settings?tab=preferences',
    locked: true,
    reward: '🤖 Autopilot activated!',
    xp: 20,
  },
  {
    id: 'review_analytics',
    title: 'Explore your Intelligence',
    description: 'See KPI trends, competitor data, and activity charts.',
    route: '/app/intelligence',
    reward: 'Data nerd activated 📊',
    xp: 10,
  },
]

const ONBOARDING_KEY = 'radariq_onboarding'

export function loadOnboardingState(): OnboardingState {
  try {
    const stored = localStorage.getItem(ONBOARDING_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return {
    completed: false,
    currentStep: 0,
    storeHealthScore: null,
    quickWins: [],
    showHealthScan: false,
    steps: ONBOARDING_STEPS.map((s, i) => ({
      ...s,
      completed: i === 0, // account creation auto-complete
    })),
  }
}

export function saveOnboardingState(state: OnboardingState) {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state))
}

export function completeOnboardingStep(stepId: string): OnboardingState {
  const state = loadOnboardingState()
  state.steps = state.steps.map(s => s.id === stepId ? { ...s, completed: true } : s)
  const allRequired = state.steps.filter(s => !s.locked).every(s => s.completed)
  state.completed = allRequired
  saveOnboardingState(state)
  return state
}

/**
 * Mark multiple steps complete in one shot without overwriting steps that are
 * already done. Used to hydrate the checklist from server-side signals so the
 * progress survives switching browsers or devices.
 */
export function markOnboardingStepsComplete(stepIds: string[]): OnboardingState {
  if (stepIds.length === 0) return loadOnboardingState()
  const state = loadOnboardingState()
  const ids = new Set(stepIds)
  let changed = false
  state.steps = state.steps.map(s => {
    if (ids.has(s.id) && !s.completed) { changed = true; return { ...s, completed: true } }
    return s
  })
  if (!changed) return state
  state.completed = state.steps.filter(s => !s.locked).every(s => s.completed)
  saveOnboardingState(state)
  try { window.dispatchEvent(new Event('radariq:onboarding-updated')) } catch { /* ignore */ }
  return state
}
