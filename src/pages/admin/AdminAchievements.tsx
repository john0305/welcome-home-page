import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAchievementQueue } from '@/stores/achievementQueue'
import { Trophy, AlertTriangle, Award, Sparkles, RefreshCw } from 'lucide-react'


interface Achievement {
  id: string
  name: string
  description: string
  flavor_text: string | null
  icon: string
  category: string
  points: number
  trigger_type: string
  trigger_condition: { metric: string; threshold: number }
  is_active: boolean
  created_at: string
}

interface AuditRow {
  id: string
  event_type: string
  achievement_id: string | null
  user_id: string | null
  performed_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface EarnedRow {
  id: string
  user_id: string
  achievement_id: string
  awarded_at: string
  award_method: string
  is_valid: boolean
  hidden_from_user: boolean
  admin_reason: string | null
  _email?: string | null
  _username?: string | null
}



export default function AdminAchievements() {
  const { toast } = useToast()
  const enqueueMany = useAchievementQueue(s => s.enqueueMany)

  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [earnedCounts, setEarnedCounts] = useState<Record<string, number>>({})
  const [systemEnabled, setSystemEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [auditLog, setAuditLog] = useState<AuditRow[]>([])
  const [awardModal, setAwardModal] = useState<Achievement | null>(null)
  const [awardEmail, setAwardEmail] = useState('')
  const [awardReason, setAwardReason] = useState('')
  const [awardMode, setAwardMode] = useState<'single' | 'bulk'>('single')
  const [awardLoading, setAwardLoading] = useState(false)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillEmail, setBackfillEmail] = useState('')
  const [earnedRows, setEarnedRows] = useState<EarnedRow[]>([])
  const [earnedFilter, setEarnedFilter] = useState('')

  const runBackfill = async (singleEmail?: string) => {
    setBackfillLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('backfill-achievements', {
        body: singleEmail ? { userEmail: singleEmail } : {},
      })
      if (error) { toast({ title: 'Backfill failed', description: error.message, variant: 'destructive' }); return }
      const d = data as { targets?: number; processed?: number; awarded?: number; errors?: string[] }
      toast({
        title: 'Backfill complete',
        description: `Processed ${d?.processed ?? 0}/${d?.targets ?? 0} users · awarded ${d?.awarded ?? 0} new achievements${d?.errors?.length ? ` · ${d.errors.length} errors` : ''}`,
      })
      await load()
    } catch (e) {
      toast({ title: 'Backfill failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBackfillLoading(false)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      let { data, error } = await supabase.functions.invoke('admin-achievements-overview', { body: {} })
      if (error) {
        try { await supabase.auth.refreshSession() } catch { /* ignore */ }
        const retry = await supabase.functions.invoke('admin-achievements-overview', { body: {} })
        data = retry.data
        error = retry.error
      }
      if (error) throw error
      const payload = (data ?? {}) as {
        achievements?: Achievement[]
        earnedCounts?: Record<string, number>
        earnedRows?: EarnedRow[]
        profiles?: Array<{ id: string; email: string | null; username: string | null }>
        systemSetting?: { value?: unknown } | null
        auditLog?: AuditRow[]
      }
      setAchievements(payload.achievements ?? [])
      setEarnedCounts(payload.earnedCounts ?? {})
      const v = payload.systemSetting?.value
      setSystemEnabled(v === true || v === 'true' || v == null)
      setAuditLog(payload.auditLog ?? [])

      const rows = payload.earnedRows ?? []
      const profMap = Object.fromEntries((payload.profiles ?? []).map(p => [p.id, { email: p.email, username: p.username }]))
      for (const r of rows) {
        r._email = profMap[r.user_id]?.email ?? null
        r._username = profMap[r.user_id]?.username ?? null
      }
      setEarnedRows(rows)
    } catch (e) {
      toast({ title: 'Load failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const toggleActive = async (a: Achievement, next: boolean) => {
    const { error } = await supabase.from('achievements').update({ is_active: next }).eq('id', a.id)
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return }
    await supabase.from('achievement_audit_log').insert({
      event_type: 'toggled_active',
      achievement_id: a.id,
      metadata: { new_state: next },
    })
    setAchievements(prev => prev.map(x => x.id === a.id ? { ...x, is_active: next } : x))
    toast({ title: next ? 'Achievement enabled' : 'Achievement paused' })
  }

  const toggleSystem = async (next: boolean) => {
    const { error } = await supabase.from('system_settings').upsert({
      key: 'achievements_enabled',
      value: next ? true : false,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'key' })
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return }
    setSystemEnabled(next)
    toast({ title: next ? 'Achievement system enabled' : 'Achievement system paused' })
  }

  const submitAward = async () => {
    if (!awardModal) return
    if (!awardReason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return }
    if (awardMode === 'single' && !awardEmail.trim()) { toast({ title: 'Email required', variant: 'destructive' }); return }
    setAwardLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-award-achievement', {
      body: {
        achievementId: awardModal.id,
        mode: awardMode,
        userEmail: awardMode === 'single' ? awardEmail.trim() : undefined,
        reason: awardReason.trim(),
      },
    })
    setAwardLoading(false)
    if (error) { toast({ title: 'Award failed', description: error.message, variant: 'destructive' }); return }
    toast({ title: 'Award sent', description: `Inserted ${(data as { inserted?: number })?.inserted ?? 0} of ${(data as { target_count?: number })?.target_count ?? 0}` })
    setAwardModal(null); setAwardEmail(''); setAwardReason(''); setAwardMode('single')
    await load()
  }

  const setEarnedFlag = async (row: EarnedRow, patch: { is_valid?: boolean; hidden_from_user?: boolean; admin_reason?: string }) => {
    const update: { is_valid?: boolean; hidden_from_user?: boolean; admin_reason?: string; invalidated_at?: string } = { ...patch }
    if (patch.is_valid === false) update.invalidated_at = new Date().toISOString()
    const { error } = await supabase.from('user_achievements').update(update).eq('id', row.id)
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return }
    await supabase.from('achievement_audit_log').insert({
      event_type: patch.is_valid === false ? 'revoked' : patch.is_valid === true ? 'restored' : patch.hidden_from_user ? 'hidden' : 'unhidden',
      achievement_id: row.achievement_id,
      user_id: row.user_id,
      metadata: { patch },
    })
    setEarnedRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } as EarnedRow : r))
    toast({ title: 'Updated' })
  }

  const deleteEarned = async (row: EarnedRow) => {
    if (!confirm(`Permanently remove this award from ${row._email ?? row.user_id}? This deletes the record.`)) return
    const { error } = await supabase.from('user_achievements').delete().eq('id', row.id)
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return }
    await supabase.from('achievement_audit_log').insert({
      event_type: 'deleted',
      achievement_id: row.achievement_id,
      user_id: row.user_id,
      metadata: { award_method: row.award_method },
    })
    setEarnedRows(prev => prev.filter(r => r.id !== row.id))
    toast({ title: 'Award deleted' })
  }



  return (
    <>
      <Helmet><title>Achievements — Admin</title></Helmet>
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,196,175,0.12)', border: '1px solid rgba(0,196,175,0.35)' }}>
              <Trophy className="h-5 w-5" style={{ color: '#00C4AF' }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Achievement System</h1>
              <p className="text-sm text-muted-foreground">Manage the 30 achievement definitions and review audit history.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                const pick = achievements.find(a => a.is_active) ?? achievements[0]
                const sample = pick ?? {
                  id: 'preview-sample',
                  name: 'Welcome Aboard',
                  description: 'You joined RadarIQ. Adventure awaits.',
                  flavor_text: 'Every legend starts somewhere. Yours starts here.',
                  icon: '🎉',
                  points: 5,
                  category: 'getting_started',
                }
                enqueueMany([{
                  id: `preview-${Date.now()}`,
                  achievement_id: sample.id,
                  awarded_at: new Date().toISOString(),
                  achievements: {
                    id: sample.id,
                    name: sample.name,
                    description: sample.description,
                    flavor_text: sample.flavor_text,
                    icon: sample.icon,
                    points: sample.points,
                    category: sample.category,
                  },
                }])
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" style={{ color: '#00C4AF' }} />
              Preview toast
            </Button>
            <div className="flex items-center gap-2">
              <Input
                value={backfillEmail}
                onChange={(e) => setBackfillEmail(e.target.value)}
                placeholder="user@email (optional)"
                className="h-9 w-56"
              />
              <Button
                variant="outline"
                disabled={backfillLoading}
                onClick={() => runBackfill(backfillEmail.trim() || undefined)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${backfillLoading ? 'animate-spin' : ''}`} style={{ color: '#00C4AF' }} />
                {backfillLoading ? 'Recalculating…' : backfillEmail.trim() ? 'Recalc user' : 'Recalc all users'}
              </Button>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card border border-border">
              <Switch checked={systemEnabled} onCheckedChange={toggleSystem} />
              <div>
                <div className="text-sm font-medium text-foreground">System {systemEnabled ? 'enabled' : 'paused'}</div>
                <div className="text-[10px] text-muted-foreground">Master switch for all organic awards</div>
              </div>
            </div>
          </div>

        </div>

        {!systemEnabled && (
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)' }}>
            <AlertTriangle className="h-5 w-5" style={{ color: '#F59E0B' }} />
            <div>
              <div className="font-medium text-foreground">Achievement system is currently paused</div>
              <div className="text-sm text-muted-foreground">No new awards are being issued. Existing awards remain visible.</div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Achievements ({achievements.length})</CardTitle>
            <CardDescription>Toggle, award manually, or pause individual achievements.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground text-sm">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3"></th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">Points</th>
                      <th className="py-2 pr-3">Trigger</th>
                      <th className="py-2 pr-3">Earned</th>
                      <th className="py-2 pr-3">Active</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {achievements.map(a => (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 pr-3 text-2xl">{a.icon}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-foreground">{a.name}</div>
                          <div className="text-[11px] text-muted-foreground italic line-clamp-1">{a.flavor_text}</div>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground capitalize">{a.category.replace(/_/g, ' ')}</td>
                        <td className="py-2 pr-3" style={{ color: '#F59E0B' }}>+{a.points}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground font-mono">
                          {a.trigger_condition.metric} ≥ {a.trigger_condition.threshold}
                        </td>
                        <td className="py-2 pr-3">{earnedCounts[a.id] ?? 0}</td>
                        <td className="py-2 pr-3">
                          <Switch checked={a.is_active} onCheckedChange={(v) => toggleActive(a, v)} />
                        </td>
                        <td className="py-2 pr-3">
                          <Button size="sm" variant="ghost" onClick={() => { setAwardModal(a); setAwardMode('single') }}>
                            <Award className="h-3.5 w-3.5 mr-1" /> Award
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>Earned achievements ({earnedRows.length})</CardTitle>
                <CardDescription>Every awarded achievement. Revoke, hide from user, or delete.</CardDescription>
              </div>
              <Input
                value={earnedFilter}
                onChange={(e) => setEarnedFilter(e.target.value)}
                placeholder="Filter by email or achievement…"
                className="h-9 w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground text-sm">Loading…</div>
            ) : earnedRows.length === 0 ? (
              <div className="text-muted-foreground text-sm">No users have earned achievements yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Achievement</th>
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3">Awarded</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnedRows
                      .filter(r => {
                        if (!earnedFilter.trim()) return true
                        const q = earnedFilter.toLowerCase()
                        const a = achievements.find(x => x.id === r.achievement_id)
                        return (r._email ?? '').toLowerCase().includes(q)
                          || (r._username ?? '').toLowerCase().includes(q)
                          || (a?.name ?? '').toLowerCase().includes(q)
                      })
                      .map(r => {
                        const a = achievements.find(x => x.id === r.achievement_id)
                        return (
                          <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2 pr-3">
                              <div className="text-foreground">{r._email ?? r.user_id.slice(0, 8)}</div>
                              {r._username && <div className="text-[11px] text-muted-foreground">@{r._username}</div>}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="mr-1">{a?.icon ?? '🏆'}</span>
                              <span className="text-foreground">{a?.name ?? r.achievement_id.slice(0, 8)}</span>
                            </td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground capitalize">{r.award_method}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(r.awarded_at).toLocaleDateString()}</td>
                            <td className="py-2 pr-3">
                              <div className="flex gap-1 flex-wrap">
                                {!r.is_valid && <Badge variant="outline" className="text-[10px]" style={{ color: '#F59E0B', borderColor: 'rgba(245,158,11,0.4)' }}>revoked</Badge>}
                                {r.hidden_from_user && <Badge variant="outline" className="text-[10px]">hidden</Badge>}
                                {r.is_valid && !r.hidden_from_user && <Badge variant="outline" className="text-[10px]" style={{ color: '#00C4AF', borderColor: 'rgba(0,196,175,0.4)' }}>visible</Badge>}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setEarnedFlag(r, { hidden_from_user: !r.hidden_from_user })}>
                                  {r.hidden_from_user ? 'Unhide' : 'Hide'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEarnedFlag(r, { is_valid: !r.is_valid })}>
                                  {r.is_valid ? 'Revoke' : 'Restore'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteEarned(r)} className="text-destructive">
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>



        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>Most recent 200 events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {auditLog.map(row => (
                <details key={row.id} className="text-xs p-2 rounded border border-border/50 bg-muted/10">
                  <summary className="cursor-pointer flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{row.event_type}</Badge>
                    <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
                    <span className="text-muted-foreground font-mono">user: {row.user_id?.slice(0, 8) ?? '—'}</span>
                  </summary>
                  <pre className="mt-2 text-[10px] whitespace-pre-wrap text-muted-foreground">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </details>
              ))}
              {auditLog.length === 0 && <div className="text-muted-foreground text-sm">No events yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!awardModal} onOpenChange={(open) => { if (!open) setAwardModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manually award: {awardModal?.icon} {awardModal?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={awardMode === 'single' ? 'default' : 'outline'} onClick={() => setAwardMode('single')}>Single user</Button>
              <Button size="sm" variant={awardMode === 'bulk' ? 'default' : 'outline'} onClick={() => setAwardMode('bulk')}>All users</Button>
            </div>
            {awardMode === 'single' && (
              <div>
                <Label>User email</Label>
                <Input value={awardEmail} onChange={(e) => setAwardEmail(e.target.value)} placeholder="seller@example.com" />
              </div>
            )}
            <div>
              <Label>Reason (required, logged)</Label>
              <Textarea value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder="Founding member recognition…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAwardModal(null)}>Cancel</Button>
            <Button onClick={submitAward} disabled={awardLoading}>
              {awardLoading ? 'Awarding…' : awardMode === 'bulk' ? 'Award all users' : 'Award user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
