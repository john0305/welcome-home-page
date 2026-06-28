import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

/**
 * Tracks alerts the user has marked "handled" so they don't keep re-appearing.
 * Dismissal is keyed by a stable `alert_key` — when the underlying alert
 * changes (new review id, new expiring count, new drop bucket), a fresh key
 * is generated and the alert re-surfaces automatically.
 */
export function useDismissedAlerts(userId: string | undefined) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) { setDismissed(new Set()); setLoading(false); return }
    const { data } = await supabase
      .from('dismissed_alerts' as never)
      .select('alert_key')
      .eq('user_id', userId)
    const set = new Set<string>(((data ?? []) as Array<{ alert_key: string }>).map(r => r.alert_key))
    setDismissed(set)
    setLoading(false)
  }, [userId])

  useEffect(() => { void refresh() }, [refresh])

  const dismiss = useCallback(async (alertType: string, alertKey: string) => {
    if (!userId) return
    setDismissed(prev => new Set(prev).add(alertKey))
    const row = { user_id: userId, alert_type: alertType, alert_key: alertKey, dismissed_at: new Date().toISOString() }
    // Cast through unknown — dismissed_alerts is not yet in the auto-gen types
    await (supabase.from('dismissed_alerts' as never) as unknown as {
      upsert: (v: typeof row, opts: { onConflict: string }) => Promise<unknown>
    }).upsert(row, { onConflict: 'user_id,alert_key' })
  }, [userId])

  return { dismissed, loading, dismiss, refresh }
}
