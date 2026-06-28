import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, UserPlus, Sparkles, Circle } from 'lucide-react'

interface ActiveUser { id: string; email: string | null; full_name: string | null; last_seen_at: string | null; tier: string }
interface RecentSignup { id: string; email: string | null; full_name: string | null; created_at: string; tier: string }
interface RecentOpt { id: string; user_id: string; type: string; status: string; created_at: string }

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AdminActivity() {
  const [active, setActive] = useState<ActiveUser[]>([])
  const [signups, setSignups] = useState<RecentSignup[]>([])
  const [opts, setOpts] = useState<RecentOpt[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [{ data: a }, { data: s }, { data: o }] = await Promise.all([
      supabase.from('user_profiles').select('id,email,full_name,last_seen_at,tier').gte('last_seen_at', fifteenMinAgo).order('last_seen_at', { ascending: false }).limit(50),
      supabase.from('user_profiles').select('id,email,full_name,created_at,tier').gte('created_at', oneDayAgo).order('created_at', { ascending: false }).limit(50),
      supabase.from('optimizations').select('id,user_id,type,status,created_at').gte('created_at', oneDayAgo).order('created_at', { ascending: false }).limit(50),
    ])
    setActive((a ?? []) as ActiveUser[])
    setSignups((s ?? []) as RecentSignup[])
    setOpts((o ?? []) as RecentOpt[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <Activity className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Activity</h1>
          <p className="text-sm text-muted-foreground">Live signals — refreshes every 30 seconds</p>
        </div>
        <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1.5">
          <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" /> Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
              Active now <span className="text-muted-foreground font-normal">({active.length})</span>
            </CardTitle>
            <CardDescription>Seen in last 15 min</CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[480px] overflow-y-auto">
            {loading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p>
              : active.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No active users right now.</p>
              : (
                <div className="divide-y divide-border">
                  {active.map(u => (
                    <div key={u.id} className="px-4 py-2.5">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email || u.id.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email} · {u.tier} · {ago(u.last_seen_at!)}</p>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#00D4C8]" />
              Recent signups <span className="text-muted-foreground font-normal">({signups.length})</span>
            </CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[480px] overflow-y-auto">
            {loading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p>
              : signups.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No signups in the last 24h.</p>
              : (
                <div className="divide-y divide-border">
                  {signups.map(u => (
                    <div key={u.id} className="px-4 py-2.5">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email || u.id.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email} · {u.tier} · {ago(u.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#00D4C8]" />
              Recent optimizations <span className="text-muted-foreground font-normal">({opts.length})</span>
            </CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="p-0 max-h-[480px] overflow-y-auto">
            {loading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p>
              : opts.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No optimizations in the last 24h.</p>
              : (
                <div className="divide-y divide-border">
                  {opts.map(o => (
                    <div key={o.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium capitalize">{o.type}</p>
                        <Badge variant="outline" className={`text-[10px] ${
                          o.status === 'accepted' ? 'border-emerald-500/40 text-emerald-300' :
                          o.status === 'rejected' ? 'border-red-500/40 text-red-300' :
                          'border-amber-500/40 text-amber-300'
                        }`}>{o.status}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">user {o.user_id.slice(0, 8)}… · {ago(o.created_at)}</p>
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
