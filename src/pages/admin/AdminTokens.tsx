import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Coins, TrendingUp, Users as UsersIcon, Cpu } from 'lucide-react'

type Range = '7d' | '30d'

interface EventRow {
  user_id: string | null
  task_key: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  total_tokens: number
  cost_usd: number
  created_at: string
}

interface ProfileLite { id: string; email: string | null; full_name: string | null; username: string | null }

const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const fmtTok = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

export default function AdminTokens() {
  const [range, setRange] = useState<Range>('30d')
  const [events, setEvents] = useState<EventRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({})
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const days = range === '7d' ? 7 : 30
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data } = await supabase
      .from('ai_usage_events')
      .select('user_id, task_key, provider, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, total_tokens, cost_usd, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20000)
    const rows = (data ?? []) as EventRow[]
    setEvents(rows)

    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    if (userIds.length) {
      const { data: ps } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, username')
        .in('id', userIds)
      const map: Record<string, ProfileLite> = {}
      ;(ps ?? []).forEach((p: ProfileLite) => { map[p.id] = p })
      setProfiles(map)
    } else {
      setProfiles({})
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [range])

  const totals = useMemo(() => {
    let cost = 0, tokens = 0, input = 0, output = 0
    for (const e of events) {
      cost += Number(e.cost_usd ?? 0)
      tokens += e.total_tokens ?? 0
      input += (e.input_tokens ?? 0) + (e.cache_read_input_tokens ?? 0) + (e.cache_creation_input_tokens ?? 0)
      output += e.output_tokens ?? 0
    }
    return { cost, tokens, input, output, calls: events.length }
  }, [events])

  const byModel = useMemo(() => aggregate(events, e => e.model), [events])
  const byTask = useMemo(() => aggregate(events, e => e.task_key), [events])
  const byUser = useMemo(() => aggregate(events, e => e.user_id ?? '—'), [events])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
            <Coins className="h-5 w-5 text-[#00D4C8]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">AI Token Usage</h1>
            <p className="text-xs text-muted-foreground">Per-user token spend and cost estimates across models</p>
          </div>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="7d">Last 7 days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total cost" value={fmtUsd(totals.cost)} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Total tokens" value={fmtTok(totals.tokens)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="AI calls" value={String(totals.calls)} icon={<Cpu className="h-4 w-4" />} />
        <StatCard label="Unique users" value={String(Object.keys(byUser).filter(k => k !== '—').length)} icon={<UsersIcon className="h-4 w-4" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BreakdownCard title="By model" rows={byModel} keyLabel="Model" />
        <BreakdownCard title="By task" rows={byTask} keyLabel="Task" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By user</CardTitle>
          <CardDescription>Top users by estimated cost in window</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : Object.keys(byUser).length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI usage recorded in this window yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-semibold py-2">User</th>
                    <th className="text-right font-semibold py-2">Calls</th>
                    <th className="text-right font-semibold py-2">Input</th>
                    <th className="text-right font-semibold py-2">Output</th>
                    <th className="text-right font-semibold py-2">Total tokens</th>
                    <th className="text-right font-semibold py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(byUser)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .slice(0, 100)
                    .map(([uid, agg]) => {
                      const p = uid !== '—' ? profiles[uid] : null
                      const label = p ? (p.full_name || p.username || p.email || uid.slice(0, 8)) : uid === '—' ? 'System / unattributed' : uid.slice(0, 8)
                      return (
                        <tr key={uid}>
                          <td className="py-2">
                            <div className="text-foreground">{label}</div>
                            {p?.email && <div className="text-[10px] text-muted-foreground">{p.email}</div>}
                          </td>
                          <td className="text-right py-2 text-muted-foreground">{agg.calls}</td>
                          <td className="text-right py-2 text-muted-foreground">{fmtTok(agg.input)}</td>
                          <td className="text-right py-2 text-muted-foreground">{fmtTok(agg.output)}</td>
                          <td className="text-right py-2">{fmtTok(agg.tokens)}</td>
                          <td className="text-right py-2 font-medium text-[#00D4C8]">{fmtUsd(agg.cost)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  )
}

function BreakdownCard({ title, rows, keyLabel }: { title: string; rows: Record<string, Agg>; keyLabel: string }) {
  const entries = Object.entries(rows).sort((a, b) => b[1].cost - a[1].cost)
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-semibold py-2">{keyLabel}</th>
                <th className="text-right font-semibold py-2">Calls</th>
                <th className="text-right font-semibold py-2">Tokens</th>
                <th className="text-right font-semibold py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map(([k, agg]) => (
                <tr key={k}>
                  <td className="py-2"><Badge variant="outline" className="font-mono text-[10px]">{k}</Badge></td>
                  <td className="text-right py-2 text-muted-foreground">{agg.calls}</td>
                  <td className="text-right py-2">{fmtTok(agg.tokens)}</td>
                  <td className="text-right py-2 font-medium text-[#00D4C8]">{fmtUsd(agg.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

interface Agg { calls: number; tokens: number; input: number; output: number; cost: number }
function aggregate(events: EventRow[], keyFn: (e: EventRow) => string): Record<string, Agg> {
  const out: Record<string, Agg> = {}
  for (const e of events) {
    const k = keyFn(e)
    const a = out[k] ?? (out[k] = { calls: 0, tokens: 0, input: 0, output: 0, cost: 0 })
    a.calls += 1
    a.tokens += e.total_tokens ?? 0
    a.input += (e.input_tokens ?? 0) + (e.cache_read_input_tokens ?? 0) + (e.cache_creation_input_tokens ?? 0)
    a.output += e.output_tokens ?? 0
    a.cost += Number(e.cost_usd ?? 0)
  }
  return out
}
