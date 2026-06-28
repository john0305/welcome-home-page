import { Check, X, Gauge, Clock, Tag, Image as ImageIcon, DollarSign, FileText } from 'lucide-react'
import { useStoreVelocity, useListingVelocity, type VelocityTrait } from '@/hooks/useStoreVelocity'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  listing: {
    id: string
    title?: string | null
    description?: string | null
    tags?: string[] | null
    photo_count?: number | null
    price?: number | null
    materials?: string[] | null
    etsy_created_at?: string | null
  }
}

interface TraitRow {
  label: string
  benchmark: string
  current: string
  passes: boolean
}

function evalTrait(t: VelocityTrait, listing: Props['listing']): TraitRow | null {
  switch (t.trait) {
    case 'title_length': {
      const cur = (listing.title ?? '').length
      const thr = t.threshold ?? 80
      return {
        label: 'Title length',
        benchmark: `Your fast sellers average ${Math.round(t.fast_avg ?? 0)} chars`,
        current: `This listing: ${cur} chars`,
        passes: cur >= thr,
      }
    }
    case 'tags_count': {
      const cur = listing.tags?.length ?? 0
      return {
        label: 'Tags used',
        benchmark: `Your fast sellers average ${Math.round(t.fast_avg ?? 0)} tags`,
        current: `This listing: ${cur}/13 tags`,
        passes: cur >= 13,
      }
    }
    case 'photo_count': {
      const cur = listing.photo_count ?? 0
      const thr = t.threshold ?? 10
      return {
        label: 'Photo count',
        benchmark: `Your fast sellers average ${(t.fast_avg ?? 0).toFixed(1)} photos`,
        current: `This listing: ${cur} photos`,
        passes: cur >= thr,
      }
    }
    case 'price': {
      const cur = listing.price ?? 0
      const fast = t.fast_avg ?? 0
      const low = fast * 0.7, high = fast * 1.3
      return {
        label: 'Price range',
        benchmark: `Your fast sellers average $${fast.toFixed(2)}`,
        current: `This listing: $${cur.toFixed(2)}`,
        passes: cur >= low && cur <= high,
      }
    }
    case 'description_length': {
      const cur = (listing.description ?? '').length
      const thr = t.threshold ?? 500
      return {
        label: 'Description length',
        benchmark: `Your fast sellers average ${Math.round(t.fast_avg ?? 0)} chars`,
        current: `This listing: ${cur} chars`,
        passes: cur >= thr,
      }
    }
    case 'has_materials': {
      const cur = (listing.materials?.length ?? 0) > 0
      return {
        label: 'Materials filled',
        benchmark: `${Math.round((t.fast_avg ?? 0) * 100)}% of your fast sellers fill this`,
        current: cur ? 'This listing: filled' : 'This listing: empty',
        passes: cur,
      }
    }
    default:
      return null
  }
}

export function VelocityContextBlock({ listing }: Props) {
  const { user } = useAuth()
  const { stats } = useStoreVelocity(user?.id)
  const velocity = useListingVelocity(listing.id)

  if (!stats?.computed_at) return null

  const locked = (stats.sample_size ?? 0) < 10
  if (locked) {
    const age = listing.etsy_created_at
      ? Math.floor((Date.now() - new Date(listing.etsy_created_at).getTime()) / 86400000)
      : null
    const tagsCount = listing.tags?.length ?? 0
    const photoCount = listing.photo_count ?? 0
    const descLen = (listing.description ?? '').length
    const price = listing.price ?? 0
    const soldCount = stats.sold_last_90d ?? 0
    const needed = Math.max(0, 10 - (stats.sample_size ?? 0))

    const isOoak = velocity?.listing_type === 'one_of_a_kind'
    const isSold = velocity?.sold && velocity.days_to_first_sale != null

    return (
      <div className="rounded-md border bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-semibold">Velocity Preview</p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {soldCount}/{soldCount + needed} sold
          </span>
        </div>

        {/* What we know about this listing's performance */}
        {isSold ? (
          <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5 shrink-0" />
            Sold in {velocity!.days_to_first_sale} day{velocity!.days_to_first_sale === 1 ? '' : 's'}
            {isOoak && <span className="text-[10px] font-normal text-muted-foreground ml-1">(one-of-a-kind)</span>}
          </div>
        ) : age != null ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {age} day{age === 1 ? '' : 's'} old — no sale recorded yet
            {isOoak && <span className="ml-1">(one-of-a-kind)</span>}
          </div>
        ) : null}

        {/* Listing quality snapshot — useful even without store benchmarks */}
        <div className="border-t border-border/50 pt-3">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Listing quality at a glance
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={tagsCount >= 13 ? 'text-emerald-600 font-medium' : tagsCount >= 8 ? 'text-amber-600' : 'text-red-500'}>
                {tagsCount}/13 tags
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={photoCount >= 10 ? 'text-emerald-600 font-medium' : photoCount >= 5 ? 'text-amber-600' : 'text-red-500'}>
                {photoCount}/10 photos
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={descLen >= 500 ? 'text-emerald-600 font-medium' : descLen >= 200 ? 'text-amber-600' : 'text-red-500'}>
                {descLen} char desc
              </span>
            </div>
            {price > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <DollarSign className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-foreground">${price.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress toward unlocking full velocity */}
        {!isOoak && (
          <p className="text-[10px] text-muted-foreground">
            {needed > 0
              ? `${needed} more sold listing${needed === 1 ? '' : 's'} needed to unlock store velocity benchmarks`
              : 'Velocity benchmarks computing…'}
          </p>
        )}
        {isOoak && (
          <p className="text-[10px] text-muted-foreground">
            One-of-a-kind listings don't repeat, so velocity comparison is limited to listing quality signals above.
          </p>
        )}
      </div>
    )
  }

  const avgDays = Math.round(stats.avg_days_to_sell ?? 0)
  const traits = (stats.fast_seller_traits ?? []).filter(t => (t.sample_size ?? 0) >= 8).slice(0, 3)
  const rows = traits.map(t => evalTrait(t, listing)).filter((x): x is TraitRow => !!x)

  const isSold = velocity?.sold && velocity.days_to_first_sale != null
  const age = listing.etsy_created_at
    ? Math.floor((Date.now() - new Date(listing.etsy_created_at).getTime()) / 86400000)
    : null

  let headerLine = ''
  let statusLine = ''
  if (isSold) {
    const d = velocity!.days_to_first_sale!
    const mult = avgDays > 0 ? avgDays / Math.max(d, 1) : 0
    headerLine = `Sold in ${d} days`
    statusLine = mult >= 1.3 ? `${mult.toFixed(1)}× faster than your store avg (${avgDays} days)`
      : mult >= 0.7 ? `On pace with your store avg (${avgDays} days)`
      : `${(1 / Math.max(mult, 0.01)).toFixed(1)}× slower than your store avg (${avgDays} days)`
  } else if (age != null) {
    const ratio = age / Math.max(avgDays, 1)
    headerLine = `This listing is ${age} days old — no sale yet`
    statusLine = ratio >= 1.3 ? `${ratio.toFixed(1)}× slower than your store average`
      : ratio >= 0.7 ? `On pace with your store average (${avgDays} days)`
      : `Below avg sell time (${avgDays} days) — still early`
  }

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Velocity Context</p>
      </div>
      {headerLine && <p className="text-sm">{headerLine}</p>}
      {!isSold && <p className="text-xs text-muted-foreground">Store avg to sell: {avgDays} days</p>}
      {statusLine && (
        <p className="text-xs font-medium" style={{ color: isSold ? '#10b981' : '#f59e0b' }}>
          {statusLine}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="border-t border-border/50" />
          <p className="text-xs font-semibold text-muted-foreground">
            {isSold ? 'Traits this listing had:' : 'Common traits of your fastest sellers:'}
          </p>
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {r.passes
                  ? <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                  : <X className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-muted-foreground">{r.benchmark} · {r.current}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
