import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { TrendData } from '@/types'
import { formatDateShort } from '@/lib/utils'

interface SalesChartProps {
  viewsTrend: TrendData[]
  salesTrend: TrendData[]
  titleSuffix?: string
}

export function SalesChart({ viewsTrend, salesTrend, titleSuffix }: SalesChartProps) {
  const span = Math.max(viewsTrend.length, salesTrend.length)
  const baseTitle = span >= 2 ? `Activity Trends (last ${span} snapshots)` : 'Activity Trends'
  const title = titleSuffix ? `Activity Trends — ${titleSuffix}${span >= 2 ? ` (last ${span} snapshots)` : ''}` : baseTitle
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <Tabs defaultValue="views">
          <TabsList className="h-8">
            <TabsTrigger value="views" className="text-xs px-3 py-1">Views</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs px-3 py-1">Sales</TabsTrigger>
          </TabsList>
          <TabsContent value="views" className="mt-3">
            <TrendLine data={viewsTrend} color="hsl(var(--primary))" label="views" />
          </TabsContent>
          <TabsContent value="sales" className="mt-3">
            <TrendLine data={salesTrend} color="#f16521" label="sales" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function TrendLine({ data, color, label }: { data: TrendData[]; color: string; label: string }) {
  // Empty / single-point states — the chart would look broken, so show a
  // friendly note that explains we just need another snapshot.
  if (data.length === 0) {
    return (
      <div className="h-[182px] flex flex-col items-center justify-center text-center px-4">
        <p className="text-sm font-medium text-foreground/80">No {label} history yet</p>
        <p className="text-xs text-muted-foreground mt-1">We'll plot the trend after the next snapshot.</p>
      </div>
    )
  }

  const latest = data[data.length - 1]?.value ?? 0
  const formatted = data.map(d => ({ ...d, date: formatDateShort(d.date) }))

  if (data.length === 1) {
    return (
      <div className="h-[182px] flex flex-col items-center justify-center text-center px-4">
        <p className="text-2xl font-bold">{latest.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">
          1 snapshot on file — take another to see the trend line.
        </p>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const avg = total / data.length

  return (
    <>
      <p className="text-2xl font-bold">{latest.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mb-3">Avg across snapshots: {Math.round(avg).toLocaleString()}</p>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={formatted} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(data.length / 5))}
          />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ background: "hsl(var(--surface-1))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px", fontSize: 12 }}>
                  <p className="font-medium">{payload[0].payload.date}</p>
                  <p style={{ color }}>{payload[0].value}</p>
                </div>
              )
            }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

