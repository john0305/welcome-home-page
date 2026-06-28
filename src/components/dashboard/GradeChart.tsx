import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GradeDistribution } from '@/types'

interface GradeChartProps {
  distribution: GradeDistribution
  titleSuffix?: string
  subtitleOverride?: string
}

const GRADE_CONFIG = [
  { key: 'a_plus', label: 'A+', color: '#10b981', range: '90-100' },
  { key: 'a',      label: 'A',  color: '#22c55e', range: '80-89' },
  { key: 'b',      label: 'B',  color: '#3b82f6', range: '70-79' },
  { key: 'c',      label: 'C',  color: '#f59e0b', range: '60-69' },
  { key: 'd',      label: 'D',  color: '#f97316', range: '50-59' },
  { key: 'f',      label: 'F',  color: '#ef4444', range: '<50' },
]

export function GradeChart({ distribution, titleSuffix, subtitleOverride }: GradeChartProps) {
  const data = GRADE_CONFIG.map(g => ({
    ...g,
    count: distribution[g.key as keyof GradeDistribution],
  }))

  const total = data.reduce((sum, d) => sum + d.count, 0)
  // Positive framing: leading with "performing well" instead of the F bar.
  const performingWell = data
    .filter(d => ['a_plus', 'a', 'b'].includes(d.key))
    .reduce((s, d) => s + d.count, 0)
  const roomToImprove = total - performingWell

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Score Distribution{titleSuffix ? ` — ${titleSuffix}` : ''}
        </CardTitle>
        <p className="text-2xl font-bold">{subtitleOverride ?? `${total} listings`}</p>
        {total > 0 && (
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span style={{ color: '#10b981' }} className="font-semibold">{performingWell}</span> performing well,{' '}
            <span className="font-semibold text-foreground">{roomToImprove}</span> have room to improve
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="range" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ background: "hsl(var(--surface-1))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px", fontSize: 12 }}>
                    <p className="font-medium">Score {d.range}</p>
                    <p className="text-muted-foreground">{d.count} listings ({total ? Math.round(d.count / total * 100) : 0}%)</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.map(d => (
            <div key={d.key} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
              {d.range}: {d.count}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
