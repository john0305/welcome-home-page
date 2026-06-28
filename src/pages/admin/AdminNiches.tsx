import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Plus, Play, RefreshCw, Users, Tag, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SeedNiche {
  id: string
  niche_label: string
  niche_key: string
  ai_generated_queries: string[] | null
  custom_queries: string[] | null
  active: boolean
  competitor_listing_count: number
  real_user_count: number
  admin_assigned_count: number
  last_refreshed: string | null
}

interface UnknownNiche {
  user_id: string
  email: string | null
  tag_inference_niche: string | null
  detected_at: string
}

export default function AdminNiches() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [nicheInput, setNicheInput] = useState('')
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [assignShop, setAssignShop] = useState('')
  const [assignNiche, setAssignNiche] = useState('')
  const [assigning, setAssigning] = useState(false)

  const { data: niches, isLoading } = useQuery({
    queryKey: ['admin_seed_niches'],
    queryFn: async () => {
      const { data, error } = await db
        .from('seed_niches')
        .select('*')
        .order('real_user_count', { ascending: false })
      if (error) throw error
      return (data ?? []) as SeedNiche[]
    },
  })

  const { data: unknownNiches } = useQuery({
    queryKey: ['admin_unknown_niches'],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_niche_profiles')
        .select('user_id, primary_niche, tag_inference_niche, detected_at')
        .eq('primary_niche', 'unknown')
        .order('detected_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as UnknownNiche[]
    },
  })

  const { data: userProfiles } = useQuery({
    queryKey: ['admin_user_list_for_niches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, email')
        .order('created_at', { ascending: false })
        .limit(200)
      return (data ?? []) as Array<{ id: string; email: string | null }>
    },
  })

  const generateNiche = async () => {
    if (!nicheInput.trim()) return
    setGeneratingFor(nicheInput)
    try {
      const { data, error } = await supabase.functions.invoke('onboarding-pipeline', {
        body: { run_type: 'niche_seed', trigger_reason: 'admin_panel' },
      })
      if (error) throw error

      // Create seed niche row with AI queries
      const { error: insertErr } = await db.from('seed_niches').insert({
        niche_label: nicheInput.trim(),
        niche_key: nicheInput.trim().toLowerCase().replace(/\s+/g, '_'),
        ai_generated_queries: data?.clusters ?? [],
        active: true,
      })
      if (insertErr) throw insertErr

      toast({ title: 'Niche added', description: nicheInput })
      setNicheInput('')
      qc.invalidateQueries({ queryKey: ['admin_seed_niches'] })
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    } finally {
      setGeneratingFor(null) }
  }

  const assignNicheToShop = async () => {
    if (!assignShop || !assignNiche) return
    setAssigning(true)
    try {
      const { error } = await db.from('user_niche_profiles').upsert({
        user_id: assignShop,
        primary_niche: assignNiche,
        niche_source: 'admin_assigned',
        niche_confidence: 1.0,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error

      // Trigger pipeline for this user
      await supabase.functions.invoke('onboarding-pipeline', {
        body: { user_id: assignShop, run_type: 'admin_assigned', trigger_reason: 'admin_niche_assign', force: true },
      })
      toast({ title: 'Niche assigned', description: 'Pipeline triggered — results in ~60s' })
      setAssignShop('')
      setAssignNiche('')
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    } finally { setAssigning(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>Niche Manager</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>Manage seed niches and assign niches to shops manually.</p>
      </div>

      {/* Add new niche */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4" style={{ color: '#00C4AF' }} />
            Add New Niche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "bath bombs" — AI generates search queries'
              value={nicheInput}
              onChange={e => setNicheInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generateNiche()}
              className="flex-1 text-sm"
              style={{ background: '#0A1A1A', borderColor: '#1a2e2e', color: 'white' }}
            />
            <Button
              onClick={generateNiche}
              disabled={!nicheInput.trim() || !!generatingFor}
              style={{ background: '#00C4AF', color: '#000' }}
              className="gap-1.5"
            >
              {generatingFor ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Generate Queries
            </Button>
          </div>
          <p className="text-xs" style={{ color: '#475569' }}>
            Type a niche keyword. RadarIQ will generate 3 Etsy search queries and start monitoring.
          </p>
        </CardContent>
      </Card>

      {/* Assign niche to shop */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: '#00C4AF' }} />
            Assign Niche to Shop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={assignShop} onValueChange={setAssignShop}>
              <SelectTrigger style={{ background: '#0A1A1A', borderColor: '#1a2e2e', color: 'white' }}>
                <SelectValue placeholder="Select shop / user" />
              </SelectTrigger>
              <SelectContent style={{ background: '#0A1A1A', borderColor: '#1a2e2e' }}>
                {(userProfiles ?? []).map(u => (
                  <SelectItem key={u.id} value={u.id} style={{ color: 'white' }}>
                    {u.email ?? u.id.slice(0, 12)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assignNiche} onValueChange={setAssignNiche}>
              <SelectTrigger style={{ background: '#0A1A1A', borderColor: '#1a2e2e', color: 'white' }}>
                <SelectValue placeholder="Select niche" />
              </SelectTrigger>
              <SelectContent style={{ background: '#0A1A1A', borderColor: '#1a2e2e' }}>
                {(niches ?? []).map(n => (
                  <SelectItem key={n.niche_key} value={n.niche_key} style={{ color: 'white' }}>
                    {n.niche_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={assignNicheToShop}
              disabled={!assignShop || !assignNiche || assigning}
              style={{ background: '#00C4AF', color: '#000' }}
              className="gap-1.5"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Assign & Run Pipeline
            </Button>
          </div>
          <p className="text-xs" style={{ color: '#475569' }}>
            Stored as niche_source: 'admin_assigned'. Overrides auto-detection. Audit trail preserved.
          </p>
        </CardContent>
      </Card>

      {/* Unknown niches */}
      {(unknownNiches ?? []).length > 0 && (
        <Card style={{ background: '#081515', borderColor: '#f59e0b40' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" style={{ color: '#f59e0b' }} />
              Unknown Niches — Needs Review ({unknownNiches?.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unknownNiches?.map(u => (
              <div key={u.user_id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                style={{ borderColor: '#0F2727' }}>
                <div>
                  <p className="text-xs font-medium text-foreground">{u.user_id.slice(0, 16)}…</p>
                  <p className="text-[10px]" style={{ color: '#64748b' }}>
                    Tags suggest: {u.tag_inference_niche ?? 'unclear'}
                  </p>
                </div>
                <Button size="sm" onClick={() => setAssignShop(u.user_id)}
                  variant="outline" className="h-7 text-[10px] border-[#00C4AF]/30 text-[#00C4AF] hover:bg-[#00C4AF]/10">
                  Assign niche →
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active niches list */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4" style={{ color: '#00C4AF' }} />
            Active Niches
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (niches ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: '#475569' }}>No seed niches yet. Add one above.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#0F2727' }}>
              {niches?.map(niche => (
                <div key={niche.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground">{niche.niche_label}</p>
                        <Badge className={niche.active ? 'bg-emerald-500/15 text-emerald-400 border-0' : 'bg-slate-500/15 text-slate-400 border-0'}>
                          {niche.active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-[10px]" style={{ color: '#64748b' }}>
                        <span>{(niche.ai_generated_queries?.length ?? 0) + (niche.custom_queries?.length ?? 0)} queries</span>
                        <span>{niche.competitor_listing_count} competitors tracked</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" />
                          {niche.real_user_count} real users · {niche.admin_assigned_count} test accounts
                        </span>
                        {niche.last_refreshed && (
                          <span>Last refreshed: {new Date(niche.last_refreshed).toLocaleDateString()}</span>
                        )}
                      </div>
                      {(niche.ai_generated_queries?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {[...(niche.ai_generated_queries ?? []), ...(niche.custom_queries ?? [])].map(q => (
                            <span key={q} className="px-1.5 py-0.5 rounded text-[9px]"
                              style={{ background: 'rgba(0,196,175,0.08)', color: '#00C4AF', border: '1px solid rgba(0,196,175,0.2)' }}>
                              {q}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] text-[#00C4AF] hover:bg-[#00C4AF]/10">
                        <RefreshCw className="h-2.5 w-2.5 mr-1" /> Refresh
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
