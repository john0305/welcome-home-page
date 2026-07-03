import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, TrendingUp, Award, Zap } from 'lucide-react'

interface DayBucket { day: string; count: number }

export default function AdminUsage() {
  const [optsByDay, setOptsByDay] = useState<DayBucket[]>([])
  const [signupsByDay, setSignupsByDay] = useState<DayBucket[]>([])
  const [avgScore, setAvgScore] = useState<number | null>(null)
  const [totals, setTotals] = useState({ opts: 0, signups: 0, listings: 0, stores: 0 })
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const since = new Date(Date.now() - 14 * 86400000).toISOString()

    const [{ data: opts }, { data: signups }, { data: listings }, { count: storesCount }] = await Promise.all([
      supabase.from('optimizations').select('created_at').gte('created_at', since).limit(5000),
      supabase.from('user_profiles').select('created_at').gte('created_at', since).limit(5000),
      supabase.from('listings').select('score').not('score', 'is', null).limit(5000),
      // Count on a granted column — column-level grants on etsy_tokens
      // (migration 20260703000001) make `select *` fail for the client role.
      supabase.from('etsy_tokens').select('user_id', { count: 'exact', head: true }),
    ])

    setOptsByDay(bucketByDay(opts ?? []))
    setSignupsByDay(bucketByDay(signups ?? []))

    const scores = (listings ?? []).map((r: any) => Number(r.score)).filter(n => !isNaN(n))
    setAvgScore(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null)

    setTotals({
      opts: opts?.length ?? 0,
      signups: signups?.length ?? 0,
      listings: listings?.length ?? 0,
      stores: storesCount ?? 0,
    })
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usage & Health</h1>
          <p className="text-sm text-muted-foreground">14-day trends across the platform</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Optimizations (14d)" value={loading ? '…' : totals.opts.toLocaleString()} />
        <StatCard icon={TrendingUp} label="Signups (14d)" value={loading ? '…' : totals.signups.toLocaleString()} />
        <StatCard icon={Zap} label="Connected stores" value={loading ? '…' : totals.stores.toLocaleString()} />
        <StatCard icon={Award} label="Avg listing grade" value={avgScore != null ? `${avgScore}/100` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Optimizations per day" description="Last 14 days" data={optsByDay} accent="#00D4C8" loading={loading} />
        <ChartCard title="Signups per day" description="Last 14 days" data={signupsByDay} accent="#F59E0B" loading={loading} />
      </div>
    </div>
  )
}

function bucketByDay(rows: { created_at: string }[]): DayBucket[] {
  const map = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    map.set(d, 0)
  }
  rows.forEach(r => {
    const d = r.created_at.slice(0, 10)
    if (map.has(d)) map.set(d, (map.get(d) ?? 0) + 1)
  })
  return Array.from(map, ([day, count]) => ({ day, count }))
}

function StatCard({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, description, data, accent, loading }: { title: string; description: string; data: DayBucket[]; accent: string; loading: boolean }) {
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex items-end gap-1.5 h-40">
            {data.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">{d.count}</div>
                <div
                  className="w-full rounded-t transition-all hover:opacity-80"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '4px' : '1px', background: accent }}
                  title={`${d.day}: ${d.count}`}
                />
                <div className="text-[9px] text-muted-foreground">{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
