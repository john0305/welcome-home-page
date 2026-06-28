// Lightweight singleton store for the inline Score Gain toast.
// Distinct from AchievementToast (different position, never queues —
// repeated fires update the visible value in place).
import { useSyncExternalStore } from 'react'

export interface ScoreToastState {
  visible: boolean
  delta: number       // signed
  score: number       // new total
  expiresAt: number   // epoch ms
}

const initial: ScoreToastState = { visible: false, delta: 0, score: 0, expiresAt: 0 }
let state = initial
const listeners = new Set<() => void>()
let hideTimer: ReturnType<typeof setTimeout> | null = null

function emit() { listeners.forEach((fn) => fn()) }

export function showScoreChange(delta: number, score: number, ttlMs = 3000) {
  if (delta === 0) return
  state = { visible: true, delta, score, expiresAt: Date.now() + ttlMs }
  emit()
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    state = { ...state, visible: false }
    emit()
  }, ttlMs)
}

export function dismissScoreChange() {
  if (hideTimer) clearTimeout(hideTimer)
  state = { ...state, visible: false }
  emit()
}

export function useScoreToast(): ScoreToastState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => state,
    () => initial,
  )
}
