import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { usePersonalQuota } from '@/hooks/usePersonalQuota'

type OptType = 'title' | 'tags' | 'description'

const MODEL_VERSION = (import.meta.env.VITE_MODEL_VERSION as string | undefined) ?? 'v1.0'

export function OptimizeTextCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { used, limits, tier } = usePersonalQuota()
  const isFree = tier === 'free'
  const limitReached = !isFree && used.optimization >= limits.optimization

  const [mode, setMode] = useState<OptType>('title')
  const [input, setInput] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ id: string; output: string } | null>(null)

  const recent = useQuery({
    queryKey: ['personal-opt-runs', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('personal_optimization_runs' as never)
        .select('id, optimization_type, input_text, action, created_at')
        .eq('user_id', user!.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data as Array<{ id: string; optimization_type: string; input_text: string; action: string | null; created_at: string }> | null) ?? []
    },
  })

  async function runOptimize() {
    if (limitReached || !input.trim()) {
      if (!input.trim()) toast({ title: 'Add some text to optimize', variant: 'destructive' })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('optimize-listing', {
        body: {
          mode: 'personal' as const,
          model_version: MODEL_VERSION,
          optimization_type: mode,
          input_text: input.trim(),
          category: category.trim() || null,
        },
      })
      if (error) {
        let msg = error.message
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try { const body = await ctx.json(); if (body?.error) msg = body.error } catch { /* ignore */ }
        }
        throw new Error(msg)
      }

      const res = data as { error?: string; optimization_id?: string; output_text?: string }
      if (res?.error) throw new Error(res.error)
      setResult({ id: res.optimization_id!, output: res.output_text ?? '' })
      await Promise.all([qc.invalidateQueries({ queryKey: ['personal-quota'] }), recent.refetch()])
    } catch (e) {
      toast({ title: 'Optimize failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function recordAction(action: 'applied' | 'edited' | 'ignored', finalText?: string) {
    if (!result) return
    await supabase
      .from('personal_optimization_runs' as never)
      .update({ action, final_text: finalText ?? result.output } as never)
      .eq('id', result.id)
    recent.refetch()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Optimize text</CardTitle>
        <p className="text-sm text-muted-foreground">Rewrite a title, tag set, or description — works on anything, not just your shop.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFree ? (
          <div className="rounded-md border border-dashed border-primary bg-primary/10 p-3 text-sm">
            Personal optimization is a paid perk.{' '}
            <Link to="/app/settings?tab=billing" className="font-medium underline">Upgrade your plan →</Link>
          </div>
        ) : limitReached ? (
          <div className="rounded-md border bg-amber-500/10 p-3 text-sm">
            Daily limit reached — resets at midnight UTC.{' '}
            <Link to="/app/settings?tab=billing" className="font-medium underline">
              Pro members get more than {limits.optimization} optimizations per day. Upgrade →
            </Link>
          </div>
        ) : null}

        <Tabs value={mode} onValueChange={v => setMode(v as OptType)}>
          <TabsList>
            <TabsTrigger value="title">Title</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="description">Description</TabsTrigger>
          </TabsList>
          <TabsContent value={mode} className="space-y-3 pt-3">
            <Textarea
              placeholder={`Current ${mode}…`}
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={mode === 'description' ? 6 : 3}
              disabled={isFree || limitReached}
            />
            <Input
              placeholder="Category (optional)"
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={isFree || limitReached}
            />
            <Button onClick={runOptimize} disabled={isFree || limitReached || loading}>
              {loading ? 'Optimizing…' : 'Optimize'}
            </Button>
          </TabsContent>
        </Tabs>

        {result && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested {mode}</p>
            <p className="whitespace-pre-wrap text-sm">{result.output}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(result.output)
                recordAction('applied')
                toast({ title: 'Copied to clipboard' })
              }}>Copy</Button>
              <Button size="sm" variant="outline" onClick={() => recordAction('applied')}>Apply to listing</Button>
              <Button size="sm" variant="ghost" onClick={() => recordAction('ignored')}>Ignore</Button>
            </div>
          </div>
        )}

        {recent.data && recent.data.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent optimizations</p>
            <ul className="divide-y rounded-md border">
              {recent.data.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate"><span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">{r.optimization_type}</span>{r.input_text.slice(0, 60)}{r.input_text.length > 60 ? '…' : ''}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{r.action ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
