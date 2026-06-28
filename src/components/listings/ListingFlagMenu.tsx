import { MoreVertical, Clock, XOctagon, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useListingFlags } from '@/hooks/useListingFlags'
import { toast } from '@/hooks/use-toast'

/**
 * Per-listing action menu for snoozing, marking won't-fix, or clearing flags.
 * Lives in the top-right of any listing card that participates in insight lists.
 */
export function ListingFlagMenu({ listingId, className, onChanged }: {
  listingId: string
  className?: string
  onChanged?: () => void
}) {
  const { flagsByListingId, applyFlag, removeFlag } = useListingFlags()
  const flags = flagsByListingId.get(listingId) ?? []
  const hasAny = flags.length > 0

  const handle = async (label: string, fn: () => Promise<unknown>) => {
    await fn()
    toast({ title: label })
    onChanged?.()
  }

  return (
    <div className={className} onClick={e => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Listing options"
            onClick={e => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void handle('Snoozed for 30 days', () => applyFlag(listingId, 'snoozed'))}>
            <Clock className="h-4 w-4" />
            <div className="flex flex-col">
              <span>Snooze 30 days</span>
              <span className="text-[10px] text-muted-foreground">Hide from suggestions for 30 days</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handle('Marked as won\u2019t fix', () => applyFlag(listingId, 'deferred'))}>
            <XOctagon className="h-4 w-4" />
            <div className="flex flex-col">
              <span>Mark as won&rsquo;t fix</span>
              <span className="text-[10px] text-muted-foreground">This listing stays as-is</span>
            </div>
          </DropdownMenuItem>
          {hasAny && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handle('Suggestions restored', () => removeFlag(listingId))}>
                <RotateCcw className="h-4 w-4" />
                <span>Show in suggestions again</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
