import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { usePersonalQuota } from '@/hooks/usePersonalQuota'
import { PersonalGradeDisplay, type PersonalGradeResult } from './PersonalGradeDisplay'

const MODEL_VERSION = (import.meta.env.VITE_MODEL_VERSION as string | undefined) ?? 'v1.0'

export function GradeListingCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { used, limits, tier } = usePersonalQuota()
  const isFree = tier === 'free'
  const limitReached = !isFree && used.grade >= limits.grade

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [materials, setMaterials] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PersonalGradeResult | null>(null)

  const recent = useQuery({
    queryKey: ['personal-grade-runs', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('grade_runs' as never)
        .select('id, listing_url, input_title, overall_score, created_at, etsy_listing_id')
        .eq('user_id', user!.id)
        .eq('usage_type', 'personal')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data as Array<{ id: string; listing_url: string | null; input_title: string | null; overall_score: number | null; created_at: string; etsy_listing_id: number | string | null }> | null) ?? []
    },
  })

  async function runGrade(mode: 'url' | 'manual') {
    if (limitReached) return
    setLoading(true)
    setResult(null)
    try {
      const payload: Record<string, unknown> = { mode: 'personal' as const, model_version: MODEL_VERSION }
      if (mode === 'url') {
        if (!url.trim()) { toast({ title: 'Paste a listing URL first', variant: 'destructive' }); setLoading(false); return }
        payload.listing_url = url.trim()
      } else {
        if (!title.trim()) { toast({ title: 'Add at least a title', variant: 'destructive' }); setLoading(false); return }
        payload.listing = {
          title: title.trim(),
          description: description.trim(),
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          materials: materials.split(',').map(m => m.trim()).filter(Boolean),
          image_urls: [],
        }
      }
      const { data, error } = await supabase.functions.invoke('grade-listing', { body: payload })
      if (error) {
        let msg = error.message
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try { const body = await ctx.json(); if (body?.error) msg = body.error } catch { /* ignore */ }
        }
        throw new Error(msg)
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      setResult(data as PersonalGradeResult)

      await Promise.all([qc.invalidateQueries({ queryKey: ['personal-quota'] }), recent.refetch()])
    } catch (e) {
      toast({ title: 'Grading failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Grade a listing</CardTitle>
        <p className="text-sm text-muted-foreground">Paste any Etsy URL or drop in title, tags, materials, and description.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFree ? (
          <UpgradeBanner feature="grading" />
        ) : limitReached ? (
          <LimitBanner kind="grades" limit={limits.grade} />
        ) : null}

        <Tabs defaultValue="url">
          <TabsList>
            <TabsTrigger value="url">From URL</TabsTrigger>
            <TabsTrigger value="manual">Paste manually</TabsTrigger>
          </TabsList>
          <TabsContent value="url" className="space-y-3 pt-3">
            <Input placeholder="Paste any Etsy listing URL..." value={url} onChange={e => setUrl(e.target.value)} disabled={isFree || limitReached} />
            <Button onClick={() => runGrade('url')} disabled={isFree || limitReached || loading}>
              {loading ? 'Grading…' : 'Grade it'}
            </Button>
          </TabsContent>
          <TabsContent value="manual" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="grade-title">Title</Label>
              <Textarea id="grade-title" value={title} onChange={e => setTitle(e.target.value)} disabled={isFree || limitReached} rows={1} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grade-tags">Tags</Label>
              <Textarea
                id="grade-tags"
                placeholder="Comma separated — e.g. silver ring, minimalist jewelry, gift for her"
                value={tags}
                onChange={e => setTags(e.target.value)}
                disabled={isFree || limitReached}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">Optional — leave blank if not available.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grade-materials">Materials</Label>
              <Textarea
                id="grade-materials"
                placeholder="Comma separated — e.g. sterling silver, cubic zirconia, gold plating"
                value={materials}
                onChange={e => setMaterials(e.target.value)}
                disabled={isFree || limitReached}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">Optional — leave blank if not available.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grade-description">Description</Label>
              <Textarea id="grade-description" value={description} onChange={e => setDescription(e.target.value)} disabled={isFree || limitReached} rows={4} />
            </div>
            <Button onClick={() => runGrade('manual')} disabled={isFree || limitReached || loading}>
              {loading ? 'Grading…' : 'Run grade'}
            </Button>
          </TabsContent>
        </Tabs>

        {result && <PersonalGradeDisplay grade={result} />}

        {recent.data && recent.data.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent grades</p>
            <ul className="divide-y rounded-md border">
              {recent.data.map(r => (
                <RecentGradeRow key={r.id} run={r} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UpgradeBanner({ feature }: { feature: string }) {
  return (
    <div className="rounded-md border border-dashed border-primary bg-primary/10 p-3 text-sm">
      Personal {feature} is a paid perk.{' '}
      <Link to="/app/settings?tab=billing" className="font-medium underline">Upgrade your plan →</Link>
    </div>
  )
}

function LimitBanner({ kind, limit }: { kind: string; limit: number }) {
  return (
    <div className="rounded-md border bg-amber-500/10 p-3 text-sm">
      Daily limit reached — resets at midnight UTC.{' '}
      <Link to="/app/settings?tab=billing" className="font-medium underline">
        Pro members get more than {limit} {kind} per day. Upgrade →
      </Link>
    </div>
  )
}

function RecentGradeRow({ run }: { run: { id: string; listing_url: string | null; input_title: string | null; overall_score: number | null; created_at: string; etsy_listing_id: number | string | null } }) {
  const [open, setOpen] = useState(false)
  const href = run.listing_url || (run.etsy_listing_id ? `https://www.etsy.com/listing/${run.etsy_listing_id}` : null)
  const label = run.input_title || (run.etsy_listing_id ? `Listing #${run.etsy_listing_id}` : run.listing_url || 'Manual entry')

  const detail = useQuery({
    queryKey: ['personal-grade-run', run.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('grade_runs' as never)
        .select('result')
        .eq('id', run.id)
        .maybeSingle()
      return (data as { result: PersonalGradeResult | null } | null)?.result ?? null
    },
  })

  return (
    <li className="text-sm">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium">{label}</span>
            {run.etsy_listing_id && (
              <span className="text-xs text-muted-foreground">ID {run.etsy_listing_id}</span>
            )}
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <span className="tabular-nums text-muted-foreground">{run.overall_score ?? '—'}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(run.created_at).toLocaleString()}</span>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs font-medium text-primary hover:underline">
              Open ↗
            </a>
          )}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3">
          {detail.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : detail.data ? (
            <PersonalGradeDisplay grade={detail.data} />
          ) : (
            <p className="text-xs text-muted-foreground">No saved details for this grade.</p>
          )}
        </div>
      )}
    </li>
  )
}
