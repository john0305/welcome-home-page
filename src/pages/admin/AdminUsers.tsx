import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  Users, LogIn, Search, Circle, Lock, Unlock, KeyRound, Mail, MoreHorizontal, ShieldAlert, RefreshCw,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TIERS = ['free', 'starter', 'pro', 'agency', 'admin'] as const
const USER_TABLE_GRID = 'grid grid-cols-[minmax(260px,1fr)_116px_96px_96px_76px_120px_128px] gap-3'
const CENTERED_COLUMN = 'flex items-center justify-center text-center min-w-0'

interface UserRow {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  tier: string
  is_affiliate: boolean
  unlimited_quota: boolean
  created_at: string
  last_seen_at: string | null
}

interface AuthMeta {
  last_sign_in_at: string | null
  banned_until: string | null
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
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function isActive(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 15 * 60 * 1000
}

function isLocked(banned_until: string | null): boolean {
  if (!banned_until) return false
  return new Date(banned_until).getTime() > Date.now()
}

export default function AdminUsers() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [storesByUser, setStoresByUser] = useState<Record<string, string>>({})
  const [optsByUser, setOptsByUser] = useState<Record<string, number>>({})
  const [authMeta, setAuthMeta] = useState<Record<string, AuthMeta>>({})
  const [activeListings, setActiveListings] = useState<Record<string, number>>({})
  const [detailsUser, setDetailsUser] = useState<UserRow | null>(null)
  const [detailsData, setDetailsData] = useState<Record<string, unknown> | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [resettingSelf, setResettingSelf] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: rows }, { data: stores }, { data: opts }, metaRes] = await Promise.all([
      supabase.from('user_profiles').select('id,email,username,full_name,tier,is_affiliate,unlimited_quota,created_at,last_seen_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('etsy_tokens').select('user_id, shop_name'),
      supabase.from('monthly_usage').select('user_id, optimizations_used').eq('month', new Date().toISOString().slice(0, 7)),
      supabase.functions.invoke('admin-user-actions', { body: { action: 'list_auth_meta' } }),
    ])
    setUsers((rows ?? []) as UserRow[])
    const s: Record<string, string> = {}
    ;(stores ?? []).forEach((r: { user_id: string; shop_name: string | null }) => { if (r.user_id) s[r.user_id] = r.shop_name ?? 'connected' })
    setStoresByUser(s)
    const o: Record<string, number> = {}
    ;(opts ?? []).forEach((r: { user_id: string; optimizations_used: number | null }) => { if (r.user_id) o[r.user_id] = r.optimizations_used ?? 0 })
    setOptsByUser(o)
    if (metaRes?.data && typeof metaRes.data === 'object') {
      const md = metaRes.data as { meta?: Record<string, AuthMeta>; listing_counts?: Record<string, number> }
      setAuthMeta(md.meta ?? {})
      setActiveListings(md.listing_counts ?? {})
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function updateTier(row: UserRow, next: string) {
    if (next === row.tier) return
    setBusyId(row.id)
    const { error } = await supabase.from('user_profiles').update({ tier: next }).eq('id', row.id)
    setBusyId(null)
    if (error) return toast({ title: 'Tier update failed', description: error.message, variant: 'destructive' })
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, tier: next } : u))
    toast({ title: 'Tier updated', description: `${row.email ?? row.id} → ${next}` })
  }

  async function toggleAffiliate(row: UserRow, next: boolean) {
    setBusyId(row.id)
    const { error } = await supabase.from('user_profiles').update({ is_affiliate: next } as never).eq('id', row.id)
    setBusyId(null)
    if (error) return toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, is_affiliate: next } : u))
  }

  async function toggleUnlimited(row: UserRow, next: boolean) {
    setBusyId(row.id)
    const { error } = await supabase.from('user_profiles').update({ unlimited_quota: next } as never).eq('id', row.id)
    setBusyId(null)
    if (error) return toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, unlimited_quota: next } : u))
    toast({ title: next ? 'Unlimited quota enabled' : 'Unlimited quota disabled', description: row.email ?? row.id })
  }

  async function callAction(row: UserRow, action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusyId(row.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { user_id: row.id, action, redirect_to: `${window.location.origin}/login` },
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: `${action} failed`, description: msg, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function impersonate(row: UserRow) {
    if (!confirm(`Sign in as ${row.email ?? row.id}? Opens a new tab.`)) return
    setBusyId(row.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: { user_id: row.id, redirect_to: `${window.location.origin}/app/dashboard` },
      })
      if (error) throw error
      if (!(data as { action_link?: string })?.action_link) throw new Error('No link returned')
      window.open((data as { action_link: string }).action_link, '_blank', 'noopener')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Impersonation failed', description: msg, variant: 'destructive' })
    } finally { setBusyId(null) }
  }

  async function lockUser(row: UserRow) {
    const r = await callAction(row, 'lock', `Lock ${row.email}? They won't be able to sign in until unlocked.`)
    if (r) {
      setAuthMeta(prev => ({ ...prev, [row.id]: { ...(prev[row.id] ?? { last_sign_in_at: null, banned_until: null }), banned_until: new Date(Date.now() + 100 * 365 * 86400000).toISOString() } }))
      toast({ title: 'Account locked', description: row.email ?? row.id })
    }
  }
  async function unlockUser(row: UserRow) {
    const r = await callAction(row, 'unlock')
    if (r) {
      setAuthMeta(prev => ({ ...prev, [row.id]: { ...(prev[row.id] ?? { last_sign_in_at: null, banned_until: null }), banned_until: null } }))
      toast({ title: 'Account unlocked', description: row.email ?? row.id })
    }
  }
  async function sendReset(row: UserRow) {
    const r = await callAction(row, 'send_password_reset', `Send a password reset email to ${row.email}?`)
    if (r) toast({ title: 'Password reset sent', description: row.email ?? row.id })
  }

  async function resetOwnPassword() {
    setResettingSelf(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { action: 'reset_own_password', redirect_to: `${window.location.origin}/login` },
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      toast({ title: 'Password reset sent', description: 'Check your inbox for the recovery link.' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Failed to send reset', description: msg, variant: 'destructive' })
    } finally { setResettingSelf(false) }
  }

  async function openDetails(row: UserRow) {
    setDetailsUser(row)
    setDetailsLoading(true)
    setDetailsData(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { user_id: row.id, action: 'get_details' },
      })
      if (error) throw error
      setDetailsData(data as Record<string, unknown>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Failed to load details', description: msg, variant: 'destructive' })
    } finally { setDetailsLoading(false) }
  }

  const filtered = users.filter(u => {
    if (tierFilter !== 'all' && u.tier !== tierFilter) return false
    if (statusFilter === 'locked' && !isLocked(authMeta[u.id]?.banned_until ?? null)) return false
    if (statusFilter === 'active' && !isActive(u.last_seen_at)) return false
    if (q) {
      const needle = q.toLowerCase()
      const hay = `${u.email ?? ''} ${u.username ?? ''} ${u.full_name ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <Users className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} total · {users.filter(u => isActive(u.last_seen_at)).length} active now · {Object.values(authMeta).filter(m => isLocked(m.banned_until)).length} locked</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
        <Button variant="outline" size="sm" disabled={resettingSelf} onClick={resetOwnPassword} className="gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          {resettingSelf ? 'Sending…' : 'Reset my password'}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <CardTitle className="text-lg">User directory</CardTitle>
            <CardDescription>Manage tier, lock accounts, reset passwords, impersonate, and view full details</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search email or name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-7 h-9 w-[220px] text-xs"
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="h-9 w-[110px] text-xs capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All tiers</SelectItem>
                {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All status</SelectItem>
                <SelectItem value="active" className="text-xs">Active now</SelectItem>
                <SelectItem value="locked" className="text-xs">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No users match the filter.</div>
          ) : (
            <div className="divide-y divide-border overflow-x-auto">
              <div className={`${USER_TABLE_GRID} min-w-[920px] px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/20`}>
                <span>User</span>
                <span className="text-center">Tier</span>
                <span className="text-center">Last seen</span>
                <span className="text-center">Last login</span>
                <span className="text-center">Listings</span>
                <span className="text-center">Etsy</span>
                <span className="text-center">Affiliate · Actions</span>
              </div>
              {filtered.map(u => {
                const active = isActive(u.last_seen_at)
                const meta = authMeta[u.id]
                const locked = isLocked(meta?.banned_until ?? null)
                const etsy = storesByUser[u.id]
                const opts = optsByUser[u.id] ?? 0
                const listings = activeListings[u.id] ?? 0
                const isSelf = u.id === user?.id
                return (
                  <div key={u.id} className={`${USER_TABLE_GRID} min-w-[920px] px-4 py-3 items-center ${locked ? 'bg-red-500/[0.04]' : ''}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Circle className={`h-2 w-2 shrink-0 ${active ? 'fill-emerald-400 text-emerald-400' : 'fill-muted text-muted'}`} />
                        <button onClick={() => openDetails(u)} className="text-sm font-medium truncate hover:underline text-left">
                          {u.full_name || u.username || u.email || u.id.slice(0, 8)}
                        </button>
                        {locked && <Badge className="text-[10px] bg-red-500/20 text-red-300 border-red-500/40 gap-1"><Lock className="h-2.5 w-2.5" />Locked</Badge>}
                        {u.unlimited_quota && <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/40">Unlimited</Badge>}
                        {u.is_affiliate && <Badge className="text-[10px] bg-[#00D4C8]/20 text-[#00D4C8] border-[#00D4C8]/30">Affiliate</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? '—'} · joined {new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <Select value={u.tier} disabled={busyId === u.id} onValueChange={(v) => updateTier(u, v)}>
                      <SelectTrigger className="relative h-8 w-full justify-center px-2 text-center text-xs capitalize [&>span]:mx-auto [&>span]:text-center [&>svg]:absolute [&>svg]:right-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className={`${CENTERED_COLUMN} text-xs text-muted-foreground`}>{timeAgo(u.last_seen_at)}</span>
                    <span className={`${CENTERED_COLUMN} text-xs text-muted-foreground`}>{timeAgo(meta?.last_sign_in_at ?? null)}</span>
                    <span className={`${CENTERED_COLUMN} text-xs`}>{listings}</span>
                    <span className={`${CENTERED_COLUMN} text-xs`}>
                      {etsy
                        ? <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300 truncate max-w-full">{etsy}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </span>
                    <div className="flex items-center gap-1 justify-center min-w-0">
                      <Switch
                        title="Affiliate"
                        checked={u.is_affiliate}
                        disabled={busyId === u.id}
                        onCheckedChange={(v) => toggleAffiliate(u, v)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busyId === u.id}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => openDetails(u)}>
                            <ShieldAlert className="h-3.5 w-3.5 mr-2" />View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => impersonate(u)} disabled={isSelf}>
                            <LogIn className="h-3.5 w-3.5 mr-2" />Sign in as user
                          </DropdownMenuItem>
                          {u.email && (
                            <DropdownMenuItem asChild>
                              <a href={`mailto:${u.email}`}><Mail className="h-3.5 w-3.5 mr-2" />Email user</a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => toggleUnlimited(u, !u.unlimited_quota)}
                            className={u.unlimited_quota ? 'text-amber-400 focus:text-amber-400' : ''}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-2" />
                            {u.unlimited_quota ? 'Disable unlimited quota' : 'Enable unlimited quota'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => sendReset(u)} disabled={isSelf || !u.email}>
                            <KeyRound className="h-3.5 w-3.5 mr-2" />Send password reset
                          </DropdownMenuItem>
                          {locked ? (
                            <DropdownMenuItem onClick={() => unlockUser(u)} disabled={isSelf} className="text-emerald-400 focus:text-emerald-400">
                              <Unlock className="h-3.5 w-3.5 mr-2" />Unlock account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => lockUser(u)} disabled={isSelf} className="text-red-400 focus:text-red-400">
                              <Lock className="h-3.5 w-3.5 mr-2" />Lock account
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailsUser} onOpenChange={(o) => { if (!o) { setDetailsUser(null); setDetailsData(null) } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsUser?.full_name || detailsUser?.username || detailsUser?.email || 'User'}</DialogTitle>
            <DialogDescription>{detailsUser?.email}</DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : detailsData && detailsUser ? (
            <DetailsBody
              data={detailsData}
              userId={detailsUser.id}
              onSaved={(patch) => {
                setDetailsData((prev) => prev ? { ...prev, profile: { ...(prev.profile as object ?? {}), ...patch } } : prev)
                setUsers((prev) => prev.map((r) => r.id === detailsUser.id ? { ...r, ...patch } as UserRow : r))
              }}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDetailsUser(null); setDetailsData(null) }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailsBody({ data, userId, onSaved }: { data: Record<string, unknown>; userId: string; onSaved: (patch: Partial<UserRow>) => void }) {
  const profile = data.profile as Record<string, unknown> | null
  const auth = data.auth as Record<string, unknown> | null
  const stores = (data.stores ?? []) as Array<Record<string, unknown>>
  const subs = (data.subscriptions ?? []) as Array<Record<string, unknown>>
  const usage = (data.recent_usage ?? []) as Array<Record<string, unknown>>
  const activeListings = data.active_listings as number | undefined
  const meta = (auth?.user_metadata ?? {}) as Record<string, unknown>
  const { toast } = useToast()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState(String(profile?.full_name ?? ''))
  const [username, setUsername] = useState(String(profile?.username ?? ''))
  const [tier, setTier] = useState(String(profile?.tier ?? 'free'))
  const [isAffiliate, setIsAffiliate] = useState(Boolean(profile?.is_affiliate))

  async function save() {
    setSaving(true)
    try {
      const updates = { full_name: fullName, username, tier, is_affiliate: isAffiliate }
      const { error } = await supabase.functions.invoke('admin-user-actions', {
        body: { user_id: userId, action: 'update_profile', updates },
      })
      if (error) throw error
      toast({ title: 'Profile updated' })
      onSaved(updates as Partial<UserRow>)
      setEditing(false)
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex justify-end">
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit profile</Button>
        )}
      </div>

      <Section title="Identity">
        <Field label="User ID" value={String(profile?.id ?? auth?.id ?? '—')} mono />
        <Field label="Email" value={String(profile?.email ?? auth?.email ?? '—')} />
        {editing ? (
          <>
            <EditField label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-7 text-xs" /></EditField>
            <EditField label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-7 text-xs" /></EditField>
          </>
        ) : (
          <>
            <Field label="Username" value={String(profile?.username ?? '—')} />
            <Field label="Full name" value={String(profile?.full_name ?? meta.full_name ?? meta.name ?? '—')} />
          </>
        )}
        <Field label="Phone" value={String(auth?.phone ?? meta.phone ?? '—')} />
        <Field label="Location" value={String(meta.location ?? meta.country ?? '—')} />
        <Field label="Gender" value={String(meta.gender ?? '—')} />
        <Field label="Avatar URL" value={String(profile?.avatar_url ?? meta.avatar_url ?? '—')} />
      </Section>

      <Section title="Account">
        {editing ? (
          <EditField label="Tier">
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="h-7 text-xs capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </EditField>
        ) : (
          <Field label="Tier" value={String(profile?.tier ?? '—')} />
        )}
        <Field label="Joined" value={profile?.created_at ? new Date(String(profile.created_at)).toLocaleString() : '—'} />
        <Field label="Last sign-in" value={auth?.last_sign_in_at ? new Date(String(auth.last_sign_in_at)).toLocaleString() : 'never'} />
        <Field label="Last seen" value={profile?.last_seen_at ? new Date(String(profile.last_seen_at)).toLocaleString() : 'never'} />
        <Field label="Email confirmed" value={auth?.email_confirmed_at ? new Date(String(auth.email_confirmed_at)).toLocaleString() : 'No'} />
        <Field label="Providers" value={Array.isArray(auth?.providers) ? (auth!.providers as string[]).join(', ') : '—'} />
        <Field label="Locked until" value={auth?.banned_until ? new Date(String(auth.banned_until)).toLocaleString() : 'Not locked'} />
        {editing ? (
          <EditField label="Affiliate">
            <Switch checked={isAffiliate} onCheckedChange={setIsAffiliate} />
          </EditField>
        ) : (
          <Field label="Affiliate" value={profile?.is_affiliate ? 'Yes' : 'No'} />
        )}
        <Field label="Invite code" value={String(profile?.invite_code ?? '—')} />
      </Section>

      <Section title={`Stores (${stores.length}) · ${activeListings ?? 0} active listings`}>
        {stores.length === 0 ? <p className="text-xs text-muted-foreground">No stores connected.</p> : stores.map((s, i) => (
          <div key={i} className="rounded border border-border p-2 space-y-1">
            <Field label="Shop" value={String(s.shop_name ?? s.etsy_shop_id ?? '—')} />
            <Field label="Etsy ID" value={String(s.etsy_shop_id ?? '—')} mono />
            <Field label="Connected" value={s.connected_at ? new Date(String(s.connected_at)).toLocaleString() : '—'} />
            <Field label="Last synced" value={s.last_synced ? new Date(String(s.last_synced)).toLocaleString() : 'never'} />
            <Field label="Total listings" value={String(s.listing_count ?? 0)} />
          </div>
        ))}
      </Section>

      <Section title={`Subscriptions (${subs.length})`}>
        {subs.length === 0 ? <p className="text-xs text-muted-foreground">No billing records.</p> : subs.map((s, i) => (
          <div key={i} className="rounded border border-border p-2 space-y-1">
            <Field label="Status" value={String(s.status ?? '—')} />
            <Field label="Environment" value={String(s.environment ?? '—')} />
            <Field label="Price ID" value={String(s.price_id ?? '—')} mono />
            <Field label="Stripe customer" value={String(s.stripe_customer_id ?? '—')} mono />
            <Field label="Period end" value={s.current_period_end ? new Date(String(s.current_period_end)).toLocaleString() : '—'} />
            <Field label="Cancel at period end" value={s.cancel_at_period_end ? 'Yes' : 'No'} />
          </div>
        ))}
      </Section>

      <Section title="Recent usage">
        {usage.length === 0 ? <p className="text-xs text-muted-foreground">No usage recorded.</p> : (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="font-semibold text-muted-foreground">Month</div>
            <div className="font-semibold text-muted-foreground">Opts</div>
            <div className="font-semibold text-muted-foreground">Grades</div>
            <div className="font-semibold text-muted-foreground">Chat</div>
            {usage.map((u, i) => (
              <div key={i} className="contents">
                <div>{String(u.month)}</div>
                <div>{String(u.optimizations_used ?? 0)}</div>
                <div>{String(u.grades_used ?? 0)}</div>
                <div>{String(u.chat_messages_used ?? 0)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {Object.keys(meta).length > 0 && (
        <Section title="Raw user metadata">
          <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">{JSON.stringify(meta, null, 2)}</pre>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#00D4C8]">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono break-all' : 'break-words'}>{value}</span>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-2 items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  )
}
