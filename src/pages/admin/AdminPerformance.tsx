import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import { Download, AlertTriangle, Check, X, Eye, TrendingUp } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function AdminPerformance() {
  const [stats, setStats] = useState<any>(null)
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [health, setHealth] = useState<{ success: number; failed: number; pending: number }>({ success: 0, failed: 0, pending: 0 })
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<any[]>([])
  const [drilldown, setDrilldown] = useState<any[]>([])
  const { toast } = useToast()

  useEffect(() => { void refresh() }, [])

  async function refresh() {
    try {
      const [s, a, runs, pendingAttr] = await Promise.all([
        supabase.from('platform_stats_cache').select('*').eq('id', 1).maybeSingle(),
        supabase.from('performance_attribution').select('*').eq('is_anomaly', true).order('created_at', { ascending: false }).limit(100),
        supabase.from('snapshot_runs').select('status').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
        supabase.from('performance_attribution').select('id', { count: 'exact', head: true }).eq('is_sufficient_data', false),
      ])
      if (s.error) console.error('platform_stats_cache', s.error)
      if (a.error) console.error('performance_attribution', a.error)
      if (runs.error) console.error('snapshot_runs', runs.error)

      setStats(s.data)

      const anomalyRows = (a.data ?? []) as any[]
      const userIds = Array.from(new Set(anomalyRows.map(r => r.user_id).filter(Boolean)))
      let profileMap: Record<string, { email: string | null; username: string | null }> = {}
      if (userIds.length) {
        const { data: profiles } = await supabase.from('user_profiles').select('id,email,username').in('id', userIds)
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, { email: p.email, username: p.username }]))
      }
      setAnomalies(anomalyRows.map(r => ({ ...r, user_profiles: profileMap[r.user_id] ?? null })))

      const runRows = runs.data ?? []
      setHealth({
        success: runRows.filter((r: any) => r.status === 'success').length,
        failed: runRows.filter((r: any) => r.status === 'failed').length,
        pending: pendingAttr.count ?? 0,
      })
    } catch (e: any) {
      console.error('AdminPerformance refresh failed', e)
      toast({ title: 'Failed to load performance data', description: e?.message ?? String(e), variant: 'destructive' })
    }
  }

  async function recomputeStats() {
    const { error } = await supabase.functions.invoke('platform-aggregate-stats')
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' })
    else { toast({ title: 'Stats recomputed' }); refresh() }
  }

  async function runAttribution() {
    toast({ title: 'Running attribution…', description: 'This may take a minute for large datasets.' })
    const { data, error } = await supabase.functions.invoke('calculate-attribution', { body: { run_all: true } })
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' })
    else {
      toast({ title: 'Attribution complete', description: `${data?.attribution_windows ?? 0} windows computed, ${data?.wins_emitted ?? 0} wins emitted.` })
      // Auto-refresh platform stats once attribution finishes
      await supabase.functions.invoke('platform-aggregate-stats')
      refresh()
    }
  }

  async function markAnomaly(id: string, status: string) {
    await supabase.from('performance_attribution').update({ admin_review_status: status }).eq('id', id)
    refresh()
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'platform_stats.json'; a.click()
    URL.revokeObjectURL(url)
  }

  async function searchUsers(term?: string) {
    const t = (term ?? userQuery).trim()
    if (!t) { setUserResults([]); return }
    const { data } = await supabase.from('user_profiles').select('id, email, username').or(`email.ilike.%${t}%,username.ilike.%${t}%`).limit(10)
    setUserResults(data ?? [])
  }

  useEffect(() => {
    const t = setTimeout(() => { void searchUsers(userQuery) }, 200)
    return () => clearTimeout(t)
  }, [userQuery])

  async function loadDrilldown(userId: string) {
    const { data } = await supabase.from('performance_attribution').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    setDrilldown(data ?? [])
  }

  const failRate = (health.success + health.failed) > 0 ? Math.round((health.failed / (health.success + health.failed)) * 100) : 0
  const failRateAlert = failRate > 10

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Performance</h1>
          <p className="text-sm text-muted-foreground">Platform-wide attribution stats and data health</p>
        </div>
      </div>
      <div className="space-y-6">


        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Platform Stats</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={runAttribution}>Run attribution now</Button>
              <Button size="sm" variant="outline" onClick={recomputeStats}>Recompute stats</Button>
              <Button size="sm" variant="outline" onClick={exportJson}><Download className="h-3 w-3 mr-1" />Export JSON</Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Total optimizations" value={stats?.total_optimizations ?? 0} />
            <Stat label="Median score Δ" value={stats?.median_score_improvement ?? '—'} />
            <Stat label="Median views lift (30d)" value={stats?.median_views_lift_30d != null ? `${stats.median_views_lift_30d}%` : '—'} />
            <Stat label="Median sales lift (30d)" value={stats?.median_sales_lift_30d != null ? `${stats.median_sales_lift_30d}%` : '—'} />
            <Stat label="% positive delta" value={stats?.pct_positive_delta != null ? `${stats.pct_positive_delta}%` : '—'} />
            <p className="col-span-full text-xs text-muted-foreground">Last computed: {stats?.computed_at ? new Date(stats.computed_at).toLocaleString() : 'never'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Data Health (last 24h)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-4 gap-4">
            <Stat label="Successful snapshots" value={health.success} />
            <Stat label="Failed snapshots" value={health.failed} />
            <Stat label="Pending windows" value={health.pending} />
            <div>
              <p className="text-xs text-muted-foreground">Failure rate</p>
              <p className={`text-lg font-semibold ${failRateAlert ? 'text-red-400' : ''}`}>{failRate}%</p>
              {failRateAlert && (
                <Badge variant="destructive" className="mt-1"><AlertTriangle className="h-3 w-3 mr-1" />Above 10%</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Attribution Anomaly Queue ({anomalies.length})</CardTitle></CardHeader>
          <CardContent>
            {anomalies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No anomalies — clean data.</p>
            ) : (
              <div className="space-y-2">
                {anomalies.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-2 rounded border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{a.user_profiles?.email ?? a.user_id}</p>
                      <p className="text-xs text-muted-foreground">{a.window_days}d — {a.anomaly_reason}</p>
                    </div>
                    <Badge variant={a.admin_review_status === 'pending' ? 'outline' : 'secondary'}>{a.admin_review_status}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markAnomaly(a.id, 'valid')}><Check className="h-3 w-3 text-emerald-400" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markAnomaly(a.id, 'invalid')}><X className="h-3 w-3 text-red-400" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => markAnomaly(a.id, 'investigating')}><Eye className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Per-User Drill Down</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search email or username (type to filter)" value={userQuery} onChange={e => setUserQuery(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              {userResults.map(u => (
                <Button key={u.id} size="sm" variant="outline" onClick={() => loadDrilldown(u.id)}>
                  {u.email ?? u.username}
                </Button>
              ))}
            </div>
            {drilldown.length > 0 && (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {drilldown.map(d => (
                  <div key={d.id} className="text-xs p-2 rounded bg-muted/30 flex gap-3">
                    <span>{new Date(d.optimized_at).toLocaleDateString()}</span>
                    <span>{d.window_days}d</span>
                    <span>views {d.views_pct ?? '—'}%</span>
                    <span>sales {d.sales_pct ?? '—'}%</span>
                    <span>score {d.score_delta ?? '—'}</span>
                    {d.is_anomaly && <Badge variant="destructive" className="ml-auto">anomaly</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
