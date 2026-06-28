/**
 * ResolvedFixes — collapsible section showing applied/monitoring fixes.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Eye, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { FixLifecycleRow } from '@/lib/fixLifecycle'

const FIELD_LABEL = {
  title: 'Title', tags: 'Tags', photos: 'Photos', description: 'Description',
  price: 'Price', quantity: 'Quantity', shipping: 'Shipping',
} as const

interface Props { listingId: string }

export function ResolvedFixes({ listingId }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<FixLifecycleRow[]>([])

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('fix_lifecycle')
      .select('*')
      .eq('listing_id', listingId)
      .in('status', ['applied', 'monitoring'])
      .order('applied_at', { ascending: false })
    setRows((data ?? []) as FixLifecycleRow[])
  }, [listingId, user?.id])

  useEffect(() => { void load() }, [load])

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <CardTitle className="text-sm flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Resolved & Monitoring
          <Badge variant="secondary" className="ml-auto">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
              {row.status === 'monitoring'
                ? <Eye className="h-3.5 w-3.5 text-blue-500" />
                : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              <span className="font-medium">{FIELD_LABEL[row.field]}</span>
              <span className="text-muted-foreground">
                {row.dismissed ? 'Dismissed' : row.status === 'monitoring' ? 'Monitoring' : 'Applied'}
                {row.applied_at && ` · ${new Date(row.applied_at).toLocaleDateString()}`}
              </span>
              {row.reopened_count > 0 && (
                <Badge variant="outline" className="ml-auto">Reopened ×{row.reopened_count}</Badge>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
