/**
 * LOCAL DEV — Admin user impersonation that works on localhost.
 *
 * How it works:
 *   1. Calls the existing admin-impersonate edge function (same one AdminUsers.tsx uses)
 *      to get an action_link magic URL.
 *   2. Instead of opening the link in a new tab (which would redirect to production),
 *      we parse the `token` param from the action_link and call supabase.auth.verifyOtp().
 *   3. verifyOtp() exchanges the token for a real session locally — no redirect needed.
 *
 * No service role key required. Works as long as you're an admin and the
 * admin-impersonate edge function is deployed.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { LogIn, Search, Info, RefreshCw, User } from 'lucide-react'

interface UserRow {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  tier: string
  created_at: string
  last_seen_at: string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function LocalDevLogin() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, email, username, full_name, tier, created_at, last_seen_at')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(200)
      .then(({ data }) => {
        setUsers((data as UserRow[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = users.filter(u => {
    if (!q) return true
    const lq = q.toLowerCase()
    return (
      u.email?.toLowerCase().includes(lq) ||
      u.username?.toLowerCase().includes(lq) ||
      u.full_name?.toLowerCase().includes(lq)
    )
  })

  async function loginAs(row: UserRow) {
    if (row.id === user?.id) {
      toast({ title: 'That is your own account' })
      return
    }
    setBusyId(row.id)
    try {
      // 1. Get magic link from the existing edge function
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: { user_id: row.id, redirect_to: window.location.origin },
      })
      if (error) throw error

      const actionLink: string | undefined = (data as { action_link?: string })?.action_link
      if (!actionLink) throw new Error('No action_link returned from edge function')

      // 2. Parse the hashed token from the action_link URL
      //    Format: https://project.supabase.co/auth/v1/verify?token=TOKEN&type=magiclink&...
      const url = new URL(actionLink)
      const tokenHash = url.searchParams.get('token')
      if (!tokenHash) throw new Error('Could not extract token from action_link')

      // 3. Verify the token locally — no redirect, sets session in the browser
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      })
      if (verifyErr) throw verifyErr

      toast({
        title: `Signed in as ${row.email ?? row.id}`,
        description: 'Session active locally. The real account is untouched on production.',
      })
      navigate('/app/dashboard', { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Login failed', description: msg, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-[var(--radius)] border border-primary/20 bg-primary/5 px-4 py-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-foreground">Local Dev — Impersonate Any User</p>
          <p className="text-xs text-muted-foreground">
            Uses the existing <code className="bg-black/20 px-1 py-0.5 rounded text-[10px]">admin-impersonate</code> edge function
            to get a magic link token, then calls <code className="bg-black/20 px-1 py-0.5 rounded text-[10px]">verifyOtp()</code> locally
            — no redirect to production. The user's real session on production is unaffected.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search by email, username, or name..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        {q && (
          <Button variant="surface" size="sm" onClick={() => setQ('')}>
            Clear
          </Button>
        )}
      </div>

      {/* User list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-[var(--radius)] skeleton-shimmer bg-surface-1" />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_80px_96px] gap-3 px-4 py-2 bg-surface-1 border-b border-border">
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">User</span>
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Tier</span>
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Last seen</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground/50 text-sm">
              No users match "{q}"
            </div>
          ) : (
            filtered.map(u => (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_80px_80px_96px] gap-3 items-center px-4 py-3 border-b border-border/40 last:border-0 hover:bg-surface-1/60 transition-colors"
              >
                {/* Identity */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary/60" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.full_name || u.username || u.email || u.id}
                    </p>
                    <p className="text-xs text-muted-foreground/55 truncate">{u.email}</p>
                  </div>
                  {u.id === user?.id && (
                    <Badge variant="default" className="shrink-0 text-[10px] h-4 px-1.5">You</Badge>
                  )}
                </div>

                {/* Tier */}
                <span className="text-xs font-medium text-muted-foreground capitalize">{u.tier}</span>

                {/* Last seen */}
                <span className="text-xs text-muted-foreground/50 tabular-nums">
                  {timeAgo(u.last_seen_at)}
                </span>

                {/* Action */}
                <Button
                  size="sm"
                  variant="teal"
                  disabled={busyId !== null || u.id === user?.id}
                  onClick={() => loginAs(u)}
                  className="h-7 px-3 text-xs"
                >
                  {busyId === u.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="h-3 w-3 mr-1.5" />
                      Login as
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/35 text-center">
        {filtered.length} of {users.length} users · sorted by last seen
      </p>
    </div>
  )
}
