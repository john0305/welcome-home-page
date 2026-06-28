import { Clock } from 'lucide-react'
import { useListingChangelog } from '@/hooks/useTractionEvents'
import { formatRelative } from '@/lib/utils'

interface Props { listingId: string | null | undefined }

/**
 * Tiny one-line changelog rendered below the grade. Reads the most recent
 * listing_snapshots row with a non-empty changed_fields array and
 * summarizes the biggest delta.
 */
export function ListingChangelog({ listingId }: Props) {
  const { change, prev } = useListingChangelog(listingId)
  if (!change || !change.changed_fields?.length) return null

  const summary = summarize(change, prev)
  if (!summary) return null

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span>Last changed: {summary} · {formatRelative(change.recorded_on)}</span>
    </div>
  )
}

function summarize(
  c: { changed_fields: string[] | null; price: number | null; tag_count: number | null; state: string | null; favorites: number | null; views: number | null },
  p: { price: number | null; tag_count: number | null; state: string | null; favorites: number | null; views: number | null } | null,
): string | null {
  const fields = c.changed_fields ?? []
  if (fields.includes('price') && p && c.price !== null && p.price !== null) {
    const diff = c.price - p.price
    const dir = diff < 0 ? 'dropped' : 'raised'
    return `price ${dir} $${Math.abs(diff).toFixed(2)}`
  }
  if (fields.includes('state') && c.state) return `status → ${c.state}`
  if (fields.includes('tag_count') && p) return `tags ${p.tag_count ?? '?'} → ${c.tag_count ?? '?'}`
  if (fields.includes('favorites') && p && c.favorites !== null && p.favorites !== null) {
    const d = c.favorites - p.favorites
    return d > 0 ? `+${d} favorites` : `${d} favorites`
  }
  if (fields.includes('views') && p && c.views !== null && p.views !== null) {
    const d = c.views - p.views
    return d > 0 ? `+${d} views` : `${d} views`
  }
  if (fields.includes('title')) return 'title updated'
  if (fields.includes('photo_count')) return 'photos updated'
  if (fields.includes('last_modified_tsz')) return 'edited on Etsy'
  return fields.slice(0, 2).join(', ') + ' updated'
}
