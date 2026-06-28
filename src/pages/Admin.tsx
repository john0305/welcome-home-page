import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  ShieldAlert, Users, Activity, TrendingUp, Sparkles, CheckCircle2, XCircle,
  Database, CreditCard, Brain, Zap, Gift, Mail, LogIn
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AiModelRouting } from '@/components/admin/AiModelRouting'

const TIERS = ['free', 'starter', 'pro', 'agency', 'admin'] as const

interface AdminUserRow {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  tier: string
  is_affiliate: boolean
  created_at: string
}

interface ConnectorStatus {
  name: string
  icon: typeof Database
  connected: boolean
  note: string
}

interface PlatformStats {
  total_users: number
  users_today: number
  users_this_week: number
  users_this_month: number
  users_by_tier: Record<string, number>
  connected_stores: number
  optimizations_today: number
  optimizations_last_hour: number
  optimizations_this_month: number
  optimizations_all_time: number
  avg_grade_lift_today: number | null
  avg_grade_lift_7d: number | null
  avg_grade_lift_30d: number | null
  acceptance_rate_pct: number | null
}

const EMPTY_STATS: PlatformStats = {
  total_users: 0,
  users_today: 0,
  users_this_week: 0,
  users_this_month: 0,
  users_by_tier: {},
  connected_stores: 0,
  optimizations_today: 0,
  optimizations_last_hour: 0,
  optimizations_this_month: 0,
  optimizations_all_time: 0,
  avg_grade_lift_today: null,
  avg_grade_lift_7d: null,
  avg_grade_lift_30d: null,
  acceptance_rate_pct: null,
}

export default function Admin() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState<PlatformStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [dbHealthy, setDbHealthy] = useState<boolean>(true)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<{ anthropic: boolean; etsy_client_id: boolean; etsy_client_secret: boolean } | null>(null)
  const [betaSignups, setBetaSignups] = useState<{ email: string; created_at: string }[]>([])
  const [betaSignupsLoading, setBetaSignupsLoading] = useState(true)
  // Admin gating is handled by <AdminRoute> in App.tsx — no duplicate check here.

  async function loadBetaSignups() {
    setBetaSignupsLoading(true)
    const { data, error } = await supabase
      .from('beta_signups')
      .select('email,created_at')
      .order('created_at', { ascending: false })
    if (!error && data) setBetaSignups(data as never)
    setBetaSignupsLoading(false)
  }

  async function loadApiStatus() {
    try {
      const { data, error } = await supabase.functions.invoke('admin-status')
      if (!error && data) setApiStatus(data as never)
    } catch { /* ignore */ }
  }

  async function loadUsers() {
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,email,username,full_name,tier,is_affiliate,created_at')
      .order('created_at', { ascending: false })
    if (!error && data) setUsers(data as unknown as AdminUserRow[])
    setUsersLoading(false)
  }

  useEffect(() => { loadUsers(); loadApiStatus(); loadBetaSignups() }, [])

  async function toggleAffiliate(row: AdminUserRow, next: boolean) {
    setUpdatingId(row.id)
    const { error } = await supabase
      .from('user_profiles')
      // is_affiliate column added via migration; cast since generated types may lag
      .update({ is_affiliate: next } as never)
      .eq('id', row.id)
    setUpdatingId(null)
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
      return
    }
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, is_affiliate: next } : u))
    toast({
      title: next ? 'Marked as affiliate' : 'Affiliate status removed',
      description: row.email ?? row.username ?? row.id,
    })
  }

  async function updateTier(row: AdminUserRow, next: string) {
    if (next === row.tier) return
    setUpdatingId(row.id)
    const { error } = await supabase
      .from('user_profiles')
      .update({ tier: next })
      .eq('id', row.id)
    setUpdatingId(null)
    if (error) {
      toast({ title: 'Tier update failed', description: error.message, variant: 'destructive' })
      return
    }
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, tier: next } : u))
    toast({ title: 'Tier updated', description: `${row.email ?? row.id} → ${next}` })
  }

  async function impersonate(row: AdminUserRow) {
    if (!confirm(
      `Sign in as ${row.email ?? row.id}?\n\n` +
      `This will open a new tab where you'll be signed in AS this user. ` +
      `Any action you take will be attributed to them. ` +
      `Use a private/incognito window if you want to stay signed in as admin here.`
    )) return

    setUpdatingId(row.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: { user_id: row.id, redirect_to: `${window.location.origin}/app/dashboard` },
      })
      if (error) throw error
      if (!data?.action_link) throw new Error('No link returned')
      window.open(data.action_link, '_blank', 'noopener')
      toast({ title: 'Sign-in link opened', description: `Opened new tab as ${row.email}` })
    } catch (e: any) {
      toast({ title: 'Impersonation failed', description: e.message ?? String(e), variant: 'destructive' })
    } finally {
      setUpdatingId(null)
    }
  }




  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const now = new Date()
        const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
        const startOfWeek = new Date(now.getTime() - 7 * 86400000)
        const startOfMonth = new Date(now.getTime() - 30 * 86400000)

        // User counts
        const [{ count: total }, { count: today }, { count: week }, { count: month }, profilesRes] = await Promise.all([
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfWeek.toISOString()),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString()),
          supabase.from('user_profiles').select('tier'),
        ])

        const tiers: Record<string, number> = {}
        ;(profilesRes.data ?? []).forEach((r: { tier: string | null }) => {
          const t = r.tier ?? 'free'
          tiers[t] = (tiers[t] ?? 0) + 1
        })

        setDbHealthy(!profilesRes.error)

        // Optional tables (may not exist yet — swallow errors gracefully)
        const safeCount = async (table: string, filter?: (q: ReturnType<typeof supabase.from>) => unknown) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q: any = supabase.from(table as never).select('*', { count: 'exact', head: true })
            if (filter) q = filter(q)
            const { count, error } = await q
            if (error) return 0
            return count ?? 0
          } catch { return 0 }
        }

        const [stores, optsToday, optsHour, optsMonth, optsAll] = await Promise.all([
          safeCount('etsy_tokens'),
          // Exclude 'superseded' rows — those are duplicate pending optimizations
          // that got replaced by a newer one for the same listing.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          safeCount('optimizations', (q: any) => q.gte('created_at', startOfDay.toISOString()).neq('status', 'superseded')),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          safeCount('optimizations', (q: any) => q.gte('created_at', new Date(now.getTime() - 3600000).toISOString()).neq('status', 'superseded')),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          safeCount('optimizations', (q: any) => q.gte('created_at', startOfMonth.toISOString()).neq('status', 'superseded')),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          safeCount('optimizations', (q: any) => q.neq('status', 'superseded')),
        ])

        if (cancelled) return
        setStats({
          total_users: total ?? 0,
          users_today: today ?? 0,
          users_this_week: week ?? 0,
          users_this_month: month ?? 0,
          users_by_tier: tiers,
          connected_stores: stores,
          optimizations_today: optsToday,
          optimizations_last_hour: optsHour,
          optimizations_this_month: optsMonth,
          optimizations_all_time: optsAll,
          avg_grade_lift_today: null,
          avg_grade_lift_7d: null,
          avg_grade_lift_30d: null,
          acceptance_rate_pct: null,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])


  const connectors: ConnectorStatus[] = [
    { name: 'Lovable Cloud (Database + Auth)', icon: Database, connected: dbHealthy, note: 'Postgres + Auth' },
    { name: 'Anthropic Claude', icon: Brain, connected: !!apiStatus?.anthropic, note: 'claude-haiku-4-5 for grading & rewrites' },
    { name: 'Etsy OAuth', icon: Zap, connected: !!(apiStatus?.etsy_client_id && apiStatus?.etsy_client_secret), note: 'Required for store connect + sync + push' },
    { name: 'Stripe', icon: CreditCard, connected: false, note: 'Not configured yet' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Platform Admin</h1>
          <p className="text-sm text-muted-foreground">Live system health, usage, and connector status</p>
        </div>
        <Badge className="ml-auto bg-amber-500/20 text-amber-300 border-amber-500/30">Admin only</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPI icon={Users} label="Total users" value={fmt(stats.total_users)} sub={`+${stats.users_today} today · +${stats.users_this_week} this week`} loading={loading} />
        <KPI icon={Zap} label="Connected stores" value={fmt(stats.connected_stores)} sub="Etsy stores linked" loading={loading} />
        <KPI icon={Activity} label="Optimizations today" value={fmt(stats.optimizations_today)} sub={`${stats.optimizations_last_hour} in last hour`} loading={loading} />
        <KPI icon={TrendingUp} label="Optimizations all-time" value={fmt(stats.optimizations_all_time)} sub={`${fmt(stats.optimizations_this_month)} this month`} loading={loading} />
      </div>

      {/* API Status — Anthropic & Etsy credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Status</CardTitle>
          <CardDescription>Backend credentials required for AI grading and Etsy sync</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'ANTHROPIC_API_KEY', ok: apiStatus?.anthropic, note: 'Claude grading & rewrites' },
            { name: 'ETSY_API_KEY', ok: (apiStatus as { etsy_api_key?: boolean })?.etsy_api_key, note: 'RadarIQ Etsy keystring (OAuth + API)' },
            { name: 'ETSY_SHARED_SECRET', ok: (apiStatus as { etsy_shared_secret?: boolean })?.etsy_shared_secret, note: 'RadarIQ Etsy shared secret (x-api-key header)' },
          ].map(s => (
            <div key={s.name} className="flex items-start gap-3 p-3 rounded-lg border" style={{
              borderColor: s.ok === undefined ? 'hsl(var(--border))' : s.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
              background: s.ok === undefined ? 'transparent' : s.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            }}>
              <div className="mt-0.5">
                {s.ok === undefined
                  ? <Activity className="h-4 w-4 text-muted-foreground" />
                  : s.ok
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <XCircle className="h-4 w-4 text-red-400" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-mono text-foreground truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.note}</p>
                <Badge variant="outline" className="mt-1.5 text-[10px]" style={{
                  borderColor: s.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
                  color: s.ok ? '#22c55e' : '#ef4444',
                }}>
                  {s.ok === undefined ? 'Checking…' : s.ok ? 'Configured' : 'Missing'}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI Model Routing — admin-controlled per-task model selection */}
      <AiModelRouting anthropicConfigured={!!apiStatus?.anthropic} />



      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Connectors</CardTitle>
          <CardDescription>Integrations powering the platform</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {connectors.map(c => (
            <div key={c.name} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50">
              <c.icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.connected
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>
                <Badge
                  variant="outline"
                  className={`mt-2 text-[10px] ${c.connected ? 'border-emerald-500/30 text-emerald-300' : 'border-border text-muted-foreground'}`}
                >
                  {c.connected ? 'Connected' : 'Not configured'}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Users by tier</CardTitle>
            <CardDescription>Live distribution from user_profiles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.total_users === 0 ? (
              <EmptyHint text="No users yet. Stats will appear here as people sign up." />
            ) : (
              <>
                {Object.entries(stats.users_by_tier).map(([tier, count]) => {
                  const pct = Math.round((count / stats.total_users) * 100)
                  return (
                    <div key={tier}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize text-muted-foreground">{tier}</span>
                        <span className="font-medium">{count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            <Separator className="my-2" />
            <Row label="Signups today" value={fmt(stats.users_today)} />
            <Row label="Signups this week" value={fmt(stats.users_this_week)} />
            <Row label="Signups this month" value={fmt(stats.users_this_month)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Optimization activity</CardTitle>
            <CardDescription>Live from optimization_records</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Stat label="Last hour" value={fmt(stats.optimizations_last_hour)} />
            <Stat label="Today" value={fmt(stats.optimizations_today)} />
            <Stat label="This month" value={fmt(stats.optimizations_this_month)} />
            <Stat label="All time" value={fmt(stats.optimizations_all_time)} />
            <Stat label="Avg lift today" value={stats.avg_grade_lift_today != null ? `+${stats.avg_grade_lift_today}` : '—'} />
            <Stat label="Avg lift 7d" value={stats.avg_grade_lift_7d != null ? `+${stats.avg_grade_lift_7d}` : '—'} />
            <Stat label="Avg lift 30d" value={stats.avg_grade_lift_30d != null ? `+${stats.avg_grade_lift_30d}` : '—'} />
            <Stat label="Acceptance rate" value={stats.acceptance_rate_pct != null ? `${stats.acceptance_rate_pct}%` : '—'} />
            {stats.optimizations_all_time === 0 && (
              <div className="col-span-2">
                <EmptyHint text="No optimizations run yet. Metrics activate once users start optimizing listings." />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User management + Beta Waitlist have moved to dedicated admin pages */}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Empty fields show "—" until live data is available. Nothing on this page is sample data.
      </p>
    </div>
  )
}

function fmt(n: number) { return n.toLocaleString() }

function KPI({ icon: Icon, label, value, sub, loading }: { icon: typeof Users; label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="text-2xl font-semibold text-foreground">{loading ? '…' : value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted-foreground italic p-3 rounded-md border border-dashed border-border bg-muted/20">
      {text}
    </div>
  )
}

// Sparkles imported but only used elsewhere — keep tree-shake friendly
void Sparkles
