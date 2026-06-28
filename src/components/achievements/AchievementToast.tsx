import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAchievementQueue } from '@/stores/achievementQueue'
import { useAuth } from '@/contexts/AuthContext'

const HOLD_DURATION = 5000
const COMBINED_THRESHOLD = 5

// Achievements are disabled platform-wide for now.
const ACHIEVEMENTS_ENABLED = false

export function AchievementToast() {
  const { current, queue, dismiss, clearAll } = useAchievementQueue()
  const { user } = useAuth()
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)

  if (!ACHIEVEMENTS_ENABLED) return null

  const soundEnabled = (user as unknown as { achievement_sounds?: boolean })?.achievement_sounds !== false

  const playSound = () => {
    if (!soundEnabled) return
    try {
      const audio = new Audio('/sounds/achievement.mp3')
      audio.volume = 0.6
      void audio.play().catch(() => {})
    } catch { /* ignore */ }
  }

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => dismiss(), 400)
    }, HOLD_DURATION)
  }

  const pauseTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  useEffect(() => {
    if (!current) { setVisible(false); return }
    // mount -> next frame -> visible (so transition runs)
    setVisible(false)
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      playSound()
      startTimer()
    })
    return () => {
      cancelAnimationFrame(raf)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  if (!current) return null

  const isCombined = queue.length + 1 >= COMBINED_THRESHOLD
  const a = current.achievements

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onClick={() => { setVisible(false); setTimeout(() => { clearAll(); navigate('/app/achievements') }, 200) }}
      style={{
        position: 'fixed',
        top: visible ? 24 : -160,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(480px, calc(100vw - 24px))',
        zIndex: 9999,
        cursor: 'pointer',
        transition: 'top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s',
        opacity: visible ? 1 : 0,
        background: '#0A0F1E',
        border: '2px solid #00C4AF',
        borderRadius: 12,
        boxShadow: '0 0 24px rgba(0, 196, 175, 0.45), 0 8px 32px rgba(0,0,0,0.6)',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontFamily: 'inherit',
      }}
    >
      {isCombined ? (
        <>
          <div style={{ fontSize: 44, lineHeight: 1 }}>🏆</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00C4AF', fontWeight: 600 }}>
              Achievements Unlocked
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              You unlocked {queue.length + 1} achievements
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
              Click to view them all
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 44, lineHeight: 1 }}>{a?.icon ?? '🏆'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00C4AF', fontWeight: 600 }}>
                Achievement Unlocked
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#F59E0B',
                background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 999,
                border: '1px solid rgba(245,158,11,0.35)',
              }}>
                +{a?.points ?? 0} pts
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {a?.name ?? 'Achievement'}
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4, fontStyle: 'italic' }}>
              {a?.flavor_text ?? a?.description}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
