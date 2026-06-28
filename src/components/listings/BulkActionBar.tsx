/**
 * BulkActionBar — appears when listings are selected.
 * "Optimize now" runs the AI immediately; the user can keep working while it
 * finishes (progress lives in useListingActions). No scheduling dialog: nightly
 * batches are an admin-driven concern, not a per-click choice.
 */

import { Sparkles, Download, X, CheckSquare, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useListingActions, MAX_BULK } from '@/hooks/useListingActions'
import { exportListingsCSV } from '@/lib/export'
import type { EtsyListing } from '@/types'

interface BulkActionBarProps {
  selectedIds: Set<string>
  listings: EtsyListing[]
  onClear: () => void
}

export function BulkActionBar({ selectedIds, listings, onClear }: BulkActionBarProps) {
  const { toast } = useToast()
  const { startBulkOptimize, startBulkGrade, bulkRun } = useListingActions()
  const count = selectedIds.size
  const selectedListings = listings.filter(l => selectedIds.has(l.id))
  const runInFlight = !!bulkRun && !bulkRun.done

  if (count === 0) return null

  const handleOptimizeNow = () => {
    const ids = Array.from(selectedIds).slice(0, MAX_BULK)
    startBulkOptimize(ids)
    onClear()
  }

  const handleGradeNow = () => {
    const ids = Array.from(selectedIds).slice(0, MAX_BULK)
    startBulkGrade(ids)
    onClear()
  }

  const handleExport = () => {
    exportListingsCSV(selectedListings)
    toast({ title: `Exported ${count} listings as CSV` })
  }

  const capped = count > MAX_BULK

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-xl animate-fade-in">
      <Badge variant="default" className="gap-1 rounded-full">
        <CheckSquare className="h-3 w-3" />
        {count} selected{capped ? ` (will run first ${MAX_BULK})` : ''}
      </Badge>

      <div className="h-4 w-px bg-border" />

      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 rounded-full text-xs"
        onClick={handleGradeNow}
        disabled={runInFlight}
      >
        <Gauge className="h-3.5 w-3.5 text-primary" />
        {runInFlight ? 'Run in progress…' : 'Grade now'}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 rounded-full text-xs"
        onClick={handleOptimizeNow}
        disabled={runInFlight}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {runInFlight ? 'Run in progress…' : 'Optimize now'}
      </Button>

      <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full text-xs" onClick={handleExport}>
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" variant="ghost" className="h-8 w-8 rounded-full p-0" onClick={onClear}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
