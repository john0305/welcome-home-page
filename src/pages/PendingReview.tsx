/**
 * PendingReview — queue of AI-optimized listings awaiting user approval.
 * Each card shows a thumbnail + before/after grades; user can open the diff dialog,
 * approve & push to Etsy, or reject. Bulk approve is available.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles, CheckCircle2, ShoppingBag, AlertTriangle } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
// (native checkbox used below; no external dep)
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { OptimizationReviewDialog } from '@/components/optimization/OptimizationReviewDialog'
import { formatRelative } from '@/lib/utils'
import { completeOnboardingStep } from '@/types/onboarding'

type FunctionErrorWithContext = Error & { context?: { json?: () => Promise<unknown> } }

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error)
  const context = (error as FunctionErrorWithContext | null)?.context
  if (!context?.json) return fallback

  try {
    const payload = await context.json()
    if (payload && typeof payload === 'object') {
      const message = (payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  } catch {
    // Use the SDK fallback when the function body is not JSON.
  }

  return fallback
}

type Row = {
  id: string
  listing_id: string
  status: string
  created_at: string
  original_title: string | null
  original_description: string | null
  original_tags: string[] | null
  original_materials: string[] | null
  optimized_title: string | null
  optimized_description: string | null
  optimized_tags: string[] | null
  optimized_materials: string[] | null
  original_grade: number | null
  new_grade: number | null
  grade_improvement: number | null
  validation_warnings: { errors?: string[]; warnings?: string[]; valid?: boolean } | null
  listings?: { title: string; thumbnail_url: string | null } | null
}

export default function PendingReview() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { refreshPendingReviewIds, loadDashboardData, refreshSyncStats } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<Row | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('optimizations')
      .select('*, listings(title, thumbnail_url)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRows((data as Row[]) ?? [])
    setLoading(false)
    void refreshPendingReviewIds()
  }

  useEffect(() => { void load() }, [user?.id])

  // Auto-open the dialog when navigated here with ?id=<optimization_id>
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id || rows.length === 0) return
    const match = rows.find(r => r.id === id)
    if (match) {
      setActive(match)
      // Clear the param so refresh doesn't re-trigger
      const next = new URLSearchParams(searchParams)
      next.delete('id')
      setSearchParams(next, { replace: true })
    }
  }, [rows, searchParams, setSearchParams])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map(r => r.id)))
  }

  const approveSelected = async () => {
    if (selected.size === 0) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    let firstError = ''
    for (const id of selected) {
      const row = rows.find(r => r.id === id)
      if (row?.validation_warnings?.errors?.length) { fail++; continue }
      const { error } = await supabase.functions.invoke('push-to-etsy', { body: { optimization_id: id } })
      if (error) {
        fail++
        if (!firstError) firstError = await getFunctionErrorMessage(error)
      } else ok++
      await new Promise(r => setTimeout(r, 300))
    }
    setBulkBusy(false)
    setSelected(new Set())
    void Promise.all([load(), loadDashboardData(), refreshSyncStats()])
    if (ok > 0) {
      completeOnboardingStep('first_optimization')
      window.dispatchEvent(new Event('radariq:onboarding-updated'))
    }
    toast({
      title: `Pushed ${ok} listing${ok === 1 ? '' : 's'} to Etsy`,
      description: fail > 0 ? `${fail} failed${firstError ? ` — ${firstError}` : ' — check validation errors.'}` : 'Originals are saved — revert anytime from the listing.',
      variant: fail > 0 ? 'destructive' : 'success',
    })
  }

  const rejectIds = async (ids: string[]) => {
    if (ids.length === 0) return
    const { error } = await supabase
      .from('optimizations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', user!.id)
    if (error) {
      toast({ title: 'Reject failed', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: `Removed ${ids.length} optimization${ids.length === 1 ? '' : 's'}` })
    setSelected(new Set())
    void load()
  }

  const rejectSelected = async () => {
    if (selected.size === 0) return
    setBulkBusy(true)
    await rejectIds(Array.from(selected))
    setBulkBusy(false)
  }

  const hasErrors = (r: Row) => (r.validation_warnings?.errors?.length ?? 0) > 0

  return (
    <div className="flex flex-col">
      <Header
        title="Pending review"
        description="AI-generated changes waiting for your approval before they go to Etsy."
        actions={
          rows.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || bulkBusy}
                onClick={rejectSelected}
                className="gap-1.5 text-muted-foreground"
              >
                Discard {selected.size > 0 ? selected.size : ''}
              </Button>
              <Button size="sm" disabled={selected.size === 0 || bulkBusy} onClick={approveSelected} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {bulkBusy ? 'Working…' : `Approve ${selected.size || 'all selected'}`}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg font-medium">Nothing to review</p>
              <p className="text-sm text-muted-foreground mt-1">
                Optimize listings and they'll show up here for approval before being pushed to Etsy.
              </p>
              <Button className="mt-4" onClick={() => navigate('/app/listings')}>Browse listings</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2">
              <input type="checkbox" aria-label="Select all pending optimizations" className="h-4 w-4 rounded border-input" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
              <span className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </div>
            <div className="space-y-2">
              {rows.map(r => (
                <Card key={r.id} className="group">
                  <CardContent className="flex items-center gap-4 p-4">
                    <input type="checkbox" aria-label="Select this optimization for review" className="h-4 w-4 rounded border-input" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    <div className="h-12 w-12 shrink-0 rounded overflow-hidden bg-slate-100">
                      {r.listings?.thumbnail_url ? (
                        <img src={r.listings.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : <ShoppingBag className="h-4 w-4 m-4 text-slate-300" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.listings?.title ?? r.optimized_title ?? 'Listing'}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] py-0 h-4 rounded-full">{formatRelative(r.created_at)}</Badge>
                        {hasErrors(r) && (
                          <Badge variant="destructive" className="gap-1 text-[10px] py-0 h-4 rounded-full">
                            <AlertTriangle className="h-2.5 w-2.5" /> Validation errors
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.original_grade != null && <GradeBadge score={r.original_grade} size="sm" />}
                      <Button size="sm" variant="outline" onClick={() => setActive(r)}>Review</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <OptimizationReviewDialog
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        optimization={active}
        onResolved={load}
      />
    </div>
  )
}
