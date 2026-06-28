// Tiny client-side flags for first-run onboarding choices. Used to gate the
// post-sync "Choose your plan" redirect so it only runs once per browser.
const PLAN_SELECTED_KEY = 'radariq_plan_selected'

export function hasSelectedPlan(): boolean {
  try { return localStorage.getItem(PLAN_SELECTED_KEY) === '1' } catch { return true }
}

export function markPlanSelected() {
  try { localStorage.setItem(PLAN_SELECTED_KEY, '1') } catch {}
}
