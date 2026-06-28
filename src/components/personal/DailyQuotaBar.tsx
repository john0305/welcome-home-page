import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePersonalQuota } from '@/hooks/usePersonalQuota'

interface MeterProps {
  label: string
  used: number
  limit: number
  resetsIn: string
  locked?: boolean
  lockedLabel?: string
}

function Meter({ label, used, limit, resetsIn, locked, lockedLabel }: MeterProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className={locked ? 'opacity-50' : ''}>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {locked ? (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{lockedLabel ?? 'Coming soon'}</Badge>
        ) : (
          <p className="text-xs tabular-nums text-muted-foreground">{used} of {limit} used today</p>
        )}
      </div>
      <Progress value={locked ? 0 : pct} className="h-1.5" />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {locked ? 'Personal try-ons launch soon for Pro & Agency.' : `Resets in ${resetsIn}`}
      </p>
    </div>
  )
}

export function DailyQuotaBar() {
  const { used, limits, resetsIn, tryOnEnabled } = usePersonalQuota()

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-5 py-5 md:grid-cols-3">
        <Meter label="Listing grades" used={used.grade} limit={limits.grade} resetsIn={resetsIn} />
        <Meter label="Text optimizations" used={used.optimization} limit={limits.optimization} resetsIn={resetsIn} />
        <Meter
          label="Virtual try-ons"
          used={used.tryon}
          limit={limits.tryon}
          resetsIn={resetsIn}
          locked={!tryOnEnabled}
        />
      </CardContent>
    </Card>
  )
}
