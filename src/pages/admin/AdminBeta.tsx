import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Mail, Download, Trash2, Archive, ArchiveRestore, CheckCircle2, UserX } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const notify = {
  success: (title: string) => toast({ title }),
  error: (title: string) => toast({ title, variant: 'destructive' as const }),
}

interface Signup {
  email: string
  first_name: string | null
  plan_interest: string | null
  shop_info: string | null
  created_at: string
  contacted_at: string | null
  archived_at: string | null
}

export default function AdminBeta() {
  const [signups, setSignups] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [signupsEnabled, setSignupsEnabled] = useState<boolean>(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('beta_signups')
      .select('email,first_name,plan_interest,shop_info,created_at,contacted_at,archived_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    setSignups((data ?? []) as Signup[])
    const { data: s } = await supabase.from('system_settings').select('value').eq('key', 'signups_enabled').maybeSingle()
    setSignupsEnabled(s?.value === true || s?.value === 'true')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleSignups = async (next: boolean) => {
    setSignupsEnabled(next)
    const { error } = await supabase.from('system_settings').upsert({ key: 'signups_enabled', value: next, updated_at: new Date().toISOString() })
    if (error) {
      notify.error('Failed to update setting')
      setSignupsEnabled(!next)
    } else {
      notify.success(next ? 'New signups enabled' : 'New signups disabled')
    }
  }

  const active = signups.filter(s => !s.archived_at)
  const archived = signups.filter(s => !!s.archived_at)

  const exportCsv = (rows: Signup[], filename: string) => {
    const header = 'email,first_name,plan_interest,shop_info,created_at,contacted_at,archived_at'
    const lines = rows.map(r => [r.email, r.first_name ?? '', r.plan_interest ?? '', r.shop_info ?? '', r.created_at, r.contacted_at ?? '', r.archived_at ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const clearAll = async () => {
    if (!confirm(`Permanently delete all ${signups.length} signups? This cannot be undone.`)) return
    const { error } = await supabase.from('beta_signups').delete().neq('email', '')
    if (error) notify.error(error.message)
    else { notify.success('Cleared all signups'); load() }
  }

  const archiveOne = async (email: string) => {
    const { error } = await supabase.from('beta_signups').update({ archived_at: new Date().toISOString() }).eq('email', email)
    if (error) notify.error(error.message); else load()
  }
  const unarchive = async (email: string) => {
    const { error } = await supabase.from('beta_signups').update({ archived_at: null }).eq('email', email)
    if (error) notify.error(error.message); else load()
  }
  const toggleContacted = async (s: Signup) => {
    const { error } = await supabase.from('beta_signups')
      .update({ contacted_at: s.contacted_at ? null : new Date().toISOString() })
      .eq('email', s.email)
    if (error) notify.error(error.message); else load()
  }
  const deleteOne = async (email: string) => {
    if (!confirm(`Delete ${email}?`)) return
    const { error } = await supabase.from('beta_signups').delete().eq('email', email)
    if (error) notify.error(error.message); else load()
  }

  const renderList = (rows: Signup[], isArchived: boolean) => (
    rows.length === 0
      ? <p className="p-6 text-sm text-muted-foreground text-center">{isArchived ? 'No archived signups.' : 'No beta signups yet.'}</p>
      : (
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {rows.map(s => (
            <div key={s.email} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {s.first_name && <p className="text-sm font-semibold text-foreground truncate">{s.first_name}</p>}
                  <p className="text-sm font-medium truncate">{s.email}</p>
                  {s.plan_interest && <Badge variant="outline" className="text-[10px] border-[#00D4C8]/40 text-[#00D4C8]">{s.plan_interest}</Badge>}
                  {s.contacted_at && <Badge variant="outline" className="text-[10px] text-[#00D4C8] border-[#00D4C8]/40">Contacted</Badge>}
                </div>
                {s.shop_info && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{s.shop_info}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => toggleContacted(s)} title={s.contacted_at ? 'Mark not contacted' : 'Mark contacted'}>
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                {isArchived ? (
                  <Button size="sm" variant="ghost" onClick={() => unarchive(s.email)} title="Restore">
                    <ArchiveRestore className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => archiveOne(s.email)} title="Archive">
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteOne(s.email)} title="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )
  )

  return (
    <div className="p-6 space-y-6 max-w-[1000px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <Mail className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Beta Waitlist</h1>
          <p className="text-sm text-muted-foreground">People who signed up to be notified at launch</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">{active.length} active · {archived.length} archived</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserX className="h-4 w-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">New user signups</CardTitle>
              <CardDescription>{signupsEnabled ? 'Anyone can create a new account' : 'Signups are paused — existing users can still log in'}</CardDescription>
            </div>
          </div>
          <Switch checked={signupsEnabled} onCheckedChange={toggleSignups} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Signups</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => exportCsv(signups, `beta-signups-${new Date().toISOString().slice(0,10)}.csv`)}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll} disabled={signups.length === 0}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Clear all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p> : (
            <Tabs defaultValue="active" className="w-full">
              <div className="px-4 pt-2">
                <TabsList>
                  <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
                  <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="active" className="mt-2">{renderList(active, false)}</TabsContent>
              <TabsContent value="archived" className="mt-2">{renderList(archived, true)}</TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
