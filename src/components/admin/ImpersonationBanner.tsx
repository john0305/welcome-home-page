import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'radariq_impersonation'
const SESSION_MS = 30 * 60 * 1000

interface ImpersonationMarker {
  sessionId: string
  startedAt: number
}

function readMarker(): ImpersonationMarker | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ImpersonationMarker) : null
  } catch {
    return null
  }
}

/**
 * Persistent "Viewing as [user]" indicator for admin impersonation sessions.
 *
 * The admin-impersonate function appends ?impersonation=<audit_session_id> to
 * the magic-link redirect. On mount this captures that marker into
 * sessionStorage (so it survives in-app navigation but not the tab closing),
 * strips it from the URL, and renders a banner until the session is ended —
 * explicitly via the button, or automatically after 30 minutes.
 */
export function ImpersonationBanner() {
  const { user, logout } = useAuth()
  const [marker, setMarker] = useState<ImpersonationMarker | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('impersonation')
    if (sessionId) {
      const fresh: ImpersonationMarker = { sessionId, startedAt: Date.now() }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
      params.delete('impersonation')
      const rest = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
      )
      return fresh
    }
    return readMarker()
  })

  const endSession = useCallback(async () => {
    const current = readMarker()
    sessionStorage.removeItem(STORAGE_KEY)
    setMarker(null)
    if (current && supabase) {
      // Best-effort audit stamp; the sign-out proceeds regardless.
      try {
        await supabase.functions.invoke('admin-impersonate', {
          body: { action: 'end', session_id: current.sessionId },
        })
      } catch {
        /* audit stamp is best-effort from the client */
      }
    }
    await logout()
    window.location.assign('/login')
  }, [logout])

  // Auto sign-out when the 30-minute window lapses.
  useEffect(() => {
    if (!marker) return
    const remaining = marker.startedAt + SESSION_MS - Date.now()
    if (remaining <= 0) {
      void endSession()
      return
    }
    const t = setTimeout(() => void endSession(), remaining)
    return () => clearTimeout(t)
  }, [marker, endSession])

  if (!marker) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 border-b border-amber-300"
    >
      <span className="font-medium">
        Viewing as {user?.email ?? 'user'} — impersonation session
      </span>
      <button
        type="button"
        onClick={() => void endSession()}
        className="rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold hover:bg-amber-200"
      >
        End session
      </button>
    </div>
  )
}
