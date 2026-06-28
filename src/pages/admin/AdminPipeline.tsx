import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Play, Pause, RotateCcw, AlertCircle, CheckCircle2, Loader2, Search, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface RunRow {
  id: string
  user_id: string | null
  run_type: string
  trigger_reason: string | null
  status: string
  listings_processed: number
  api_calls_made: number
  cache_hits: number
  errors: unknown
  started_at: string
  completed_at: string | null
  email?: string
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  complete: { bg: 'bg-emerald-500/15', fg: 'text-emerald-400', label: 'Complete' },
  running:  { bg: 'bg-blue-500/15',    fg: 'text-blue-400',    label: 'Running' },
  failed:   { bg: 'bg-red-500/15',     fg: 'text-red-400',     label: 'Failed' },
  skipped:  { bg: 'bg-slate-500/15',   fg: 'text-slate-400',   label: 'Skipped' },
}

export default function AdminPipeline() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [searchUser, setSearchUser] = useState('')
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null)
  const [triggering, setTriggering] = useState(false)

  const { data: runs, isLoading } = useQuery({
    queryKey: ['admin_pipeline_runs'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: runs, error } = await db
        .from('pipeline_run_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100)
      if (error) throw error

      // Fetch emails for distinct user_ids
      const userIds = [...new Set((runs ?? []).map((r: Record<string, unknown>) => r.user_id as string).filter(Boolean))] as string[]
      const { data: profiles } = userIds.length
        ? await supabase.from('user_profiles').select('id, email').in('id', userIds)
        : { data: [] }
      const emailMap = new Map((profiles ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email]))

      return (runs ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        email: emailMap.get(r.user_id as string) ?? null,
      })) as RunRow[]
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['platform_settings_pipeline'],
    queryFn: async () => {
      const { data } = await db.from('platform_settings')
        .select('key, value')
        .in('key', ['daily_quota_ceiling', 'competitor_pull_limit'])
      const map: Record<string, string> = {}
      for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) map[row.key] = String(row.value)
      return map
    },
  })

  const runForUser = async (userId: string) => {
    setTriggering(true)
    try {
      const { data, error } = await supabase.functions.invoke('onboarding-pipeline', {
        body: { user_id: userId, run_type: 'admin_triggered', trigger_reason: 'admin_panel', force: true },
      })
      if (error) throw error
      toast({ title: 'Pipeline started', description: `User ${userId.slice(0, 8)}… — ${data?.niche ?? 'processing'}` })
      qc.invalidateQueries({ queryKey: ['admin_pipeline_runs'] })
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    } finally {
      setTriggering(false) }
  }

  const filtered = (runs ?? []).filter(r =>
    !searchUser || r.user_id?.includes(searchUser) || r.email?.toLowerCase().includes(searchUser.toLowerCase())
  )

  const stats = {
    total: runs?.length ?? 0,
    running: runs?.filter(r => r.status === 'running').length ?? 0,
    failed: runs?.filter(r => r.status === 'failed').length ?? 0,
    avgListings: runs?.length
      ? Math.round(runs.reduce((s, r) => s + r.listings_processed, 0) / runs.length)
      : 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>Pipeline Health</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>All market intelligence pipeline runs. Trigger, pause, or retry from here.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total runs (100 latest)', value: stats.total },
          { label: 'Currently running', value: stats.running, color: stats.running > 0 ? '#3b82f6' : undefined },
          { label: 'Failed runs', value: stats.failed, color: stats.failed > 0 ? '#ef4444' : undefined },
          { label: 'Avg listings/run', value: stats.avgListings },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border p-4" style={{ background: '#081515', borderColor: '#0F2727' }}>
            <p className="text-2xl font-bold" style={{ color: color ?? '#00C4AF', fontFamily: 'Sora, sans-serif' }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground">Pipeline Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by user ID or email"
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
              className="h-8 w-64 text-xs"
              style={{ background: '#0A1A1A', borderColor: '#1a2e2e', color: 'white' }}
            />
            <Button
              size="sm"
              disabled={!searchUser || triggering}
              onClick={() => {
                const match = filtered[0]
                if (match?.user_id) runForUser(match.user_id)
              }}
              className="h-8 text-xs gap-1.5"
              style={{ background: '#00C4AF', color: '#000' }}
            >
              {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run user
            </Button>
          </div>
          <p className="text-xs self-center" style={{ color: '#475569' }}>
            Daily quota: {settings?.daily_quota_ceiling ?? '9000'} calls/day
          </p>
        </CardContent>
      </Card>

      {/* Run log table */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Search className="h-4 w-4" style={{ color: '#64748b' }} />
            Run Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: '#475569' }}>No pipeline runs found.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#0F2727' }}>
              {filtered.map(run => {
                const sty = STATUS_STYLES[run.status] ?? STATUS_STYLES.skipped
                const dur = run.completed_at && run.started_at
                  ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                  : null

                return (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => setSelectedRun(run === selectedRun ? null : run)}
                  >
                    <div className="shrink-0">
                      {run.status === 'running'
                        ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#3b82f6' }} />
                        : run.status === 'complete'
                        ? <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                        : run.status === 'failed'
                        ? <AlertCircle className="h-4 w-4" style={{ color: '#ef4444' }} />
                        : <Pause className="h-4 w-4" style={{ color: '#64748b' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">{run.email ?? run.user_id?.slice(0, 12) ?? 'system'}</span>
                        <Badge className={`${sty.bg} ${sty.fg} text-[10px] px-1.5 py-0 border-0`}>{sty.label}</Badge>
                        <span className="text-[10px]" style={{ color: '#475569' }}>{run.run_type} · {run.trigger_reason}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px]" style={{ color: '#475569' }}>{format(new Date(run.started_at), 'MMM d, h:mm a')}</span>
                        <span className="text-[10px]" style={{ color: '#334155' }}>{run.listings_processed} listings · {run.api_calls_made} API calls · {run.cache_hits} cache hits</span>
                        {dur !== null && <span className="text-[10px]" style={{ color: '#334155' }}>{dur}s</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: '#334155', transform: run === selectedRun ? 'rotate(90deg)' : '' }} />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run detail drawer */}
      {selectedRun && (
        <Card style={{ background: '#081015', borderColor: '#0F2727' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Run Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-[11px] whitespace-pre-wrap leading-relaxed" style={{ color: '#94a3b8' }}>
              {JSON.stringify(selectedRun, null, 2)}
            </pre>
            {selectedRun.status === 'failed' && (
              <Button
                size="sm"
                className="mt-3 text-xs gap-1.5"
                style={{ background: '#00C4AF', color: '#000' }}
                onClick={() => selectedRun.user_id && runForUser(selectedRun.user_id)}
              >
                <RotateCcw className="h-3 w-3" />
                Retry this run
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
