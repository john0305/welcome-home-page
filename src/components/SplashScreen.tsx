import { useEffect, useState } from 'react'
import { RadarIcon } from '@/components/layout/Logo'

const SESSION_KEY = 'radariq:splash-shown'
const DURATION_MS = 1500
const FADE_MS = 350

/**
 * First-mount splash. Shows the RadarIQ radar mark on #0f172a, then fades out.
 * Only shown once per browser session to avoid interrupting in-app navigations.
 */
export function SplashScreen() {
  const initialShow = (() => {
    if (typeof window === 'undefined') return false
    try { return sessionStorage.getItem(SESSION_KEY) !== '1' } catch { return true }
  })()

  const [visible, setVisible] = useState(initialShow)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
    if (!visible) return
    const t1 = window.setTimeout(() => setFading(true), DURATION_MS)
    const t2 = window.setTimeout(() => {
      setVisible(false)
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
    }, DURATION_MS + FADE_MS)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [visible])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: '#0f172a',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <RadarIcon size={96} animated />
          {/* Teal sweep ring for extra splash feel */}
          <span
            className="splash-ring absolute inset-0 rounded-full"
            style={{
              border: '2px solid rgba(20,184,166,0.5)',
              boxShadow: '0 0 24px rgba(20,184,166,0.35)',
            }}
          />
        </div>
        <p
          className="text-sm font-extrabold tracking-[0.3em]"
          style={{ color: '#14b8a6' }}
        >
          RADAR<span className="text-white"> IQ</span>
        </p>
      </div>
      <style>{`
        @keyframes splash-ring-spin {
          0%   { transform: rotate(0deg)   scale(1);   opacity: 0.9; }
          50%  { transform: rotate(180deg) scale(1.08); opacity: 0.5; }
          100% { transform: rotate(360deg) scale(1);   opacity: 0.9; }
        }
        .splash-ring { animation: splash-ring-spin 1.5s linear infinite; }
      `}</style>
    </div>
  )
}
