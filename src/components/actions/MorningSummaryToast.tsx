import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { useTodaySummary } from '@/hooks/useFixActions'
import { useAuth } from '@/contexts/AuthContext'

/**
 * One-time morning toast on login: "We found N things to improve…"
 * Suppressed for the rest of the day via sessionStorage.
 */
export function MorningSummaryToast() {
  const summary = useTodaySummary()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    if (!user?.id || !summary) return
    if ((summary.actions_generated ?? 0) <= 0) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `radariq_morning_toast_${user.id}_${today}`
    if (typeof window !== 'undefined' && localStorage.getItem(key)) return
    fired.current = true
    try { localStorage.setItem(key, '1') } catch { /* ignore */ }
    toast({
      title: `We found ${summary.actions_generated} things to improve across your shop.`,
      description: summary.auto_applied > 0
        ? `${summary.auto_applied} already fixed automatically while you slept.`
        : 'Review them one tap at a time.',
      action: (
        <ToastAction altText="Review now" onClick={() => navigate('/app/actions')}>
          Review now →
        </ToastAction>
      ),
    })
  }, [summary, user?.id, toast, navigate])

  return null
}
