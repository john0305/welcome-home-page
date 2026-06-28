/**
 * FixActionDrawer — modal wrapper around FixActionCard.
 *
 * Loads a single fix_action by id and renders it inside a Dialog so users
 * can review/apply the fix without leaving the Dashboard. Used by
 * "Tonight's Top Fixes" on the Dashboard.
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { FixActionCard } from '@/components/actions/FixActionCard'
import type { FixActionRow } from '@/hooks/useFixActions'

interface Props {
  fixActionId: string | null
  onClose: () => void
}

export function FixActionDrawer({ fixActionId, onClose }: Props) {
  const [row, setRow] = useState<FixActionRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fixActionId) { setRow(null); return }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('fix_actions')
        .select('*, listing:listings(id, title, etsy_listing_id)')
        .eq('id', fixActionId)
        .maybeSingle()
      if (!cancelled) {
        setRow((data as unknown as FixActionRow) ?? null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fixActionId])

  return (
    <Dialog open={!!fixActionId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl bg-surface-1 border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Review fix</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {!loading && row && (
          <FixActionCard row={row} onChange={(updated) => { if (updated == null) onClose() }} />
        )}
        {!loading && !row && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            This fix is no longer available — it may have been applied or dismissed.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
