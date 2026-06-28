/**
 * Review dialog for selective single-field rewrites (title/description/tags/materials).
 * Loads the optimization row by id, renders a focused before/after diff, and lets
 * the user push the change to Etsy or reject it.
 */
import { useEffect, useState } from 'react'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RejectModal, type RejectionCategory } from './RejectModal'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useListingActions } from '@/hooks/useListingActions'
import { recordOptimizationFeedback } from '@/lib/optimizationFeedback'

interface SelectiveOpt {
  id: string
  listing_id: string
  type: 'title' | 'description' | 'tags' | 'materials'
  original_text: string | null
  suggested_text: string | null
}

interface Props {
  open: boolean
  optimizationId: string | null
  onOpenChange: (open: boolean) => void
  onResolved?: () => void
}

export function SelectiveRewriteReviewDialog({ open, optimizationId, onOpenChange, onResolved }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [opt, setOpt] = useState<SelectiveOpt | null>(null)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const { rejectAndReoptimize } = useListingActions()

  useEffect(() => {
    if (!open || !optimizationId) {
      setOpt(null)
      setPushError(null)
      return
    }
    setLoading(true)
    supabase
      .from('optimizations')
      .select('id, listing_id, type, original_text, suggested_text')
      .eq('id', optimizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast({ title: 'Could not load suggestion', description: error.message, variant: 'destructive' })
        setOpt(data as SelectiveOpt | null)
        setLoading(false)
      })
  }, [open, optimizationId, toast])

  const handleApprove = async () => {
    if (!opt) return
    setBusy('approve')
    setPushError(null)
    const { error } = await supabase.functions.invoke('push-to-etsy', {
      body: { optimization_id: opt.id },
    })
    setBusy(null)
    if (error) {
      setPushError(error.message)
      toast({ title: 'Push failed', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Pushed to Etsy', description: 'Your listing is updated. You can revert anytime.', variant: 'success' })
    onResolved?.()
    onOpenChange(false)
  }

  const handleSimpleReject = async (category: RejectionCategory, comment: string) => {
    if (!opt) return
    setBusy('reject')
    const { error } = await supabase
      .from('optimizations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString(), reject_reason: comment })
      .eq('id', opt.id)
    setBusy(null)
    if (error) {
      toast({ title: 'Reject failed', description: error.message, variant: 'destructive' })
      return
    }
    void recordOptimizationFeedback({
      optimizationId: opt.id,
      listingId: opt.listing_id,
      action: 'rejected',
      reasonCategory: category,
      reasonText: comment || null,
    })
    toast({ title: 'Suggestion rejected', description: 'Thanks for the feedback.' })
    onResolved?.()
    onOpenChange(false)
  }

  const handleRejectAndReoptimize = async (instructions: string) => {
    if (!opt) return
    const result = await rejectAndReoptimize(opt.id, opt.listing_id, instructions)
    if (result) {
      onResolved?.()
      onOpenChange(false)
    } else {
      throw new Error('Re-optimization failed')
    }
  }



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Review {opt?.type ?? 'rewrite'} suggestion
          </DialogTitle>
          <DialogDescription>
            Approve to push this change to Etsy, or reject to discard it.
          </DialogDescription>
        </DialogHeader>

        {loading || !opt ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DiffBody opt={opt} />
        )}

        {pushError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Push failed</AlertTitle>
            <AlertDescription className="text-xs">{pushError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={!!busy || !opt}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </Button>
          <Button onClick={handleApprove} disabled={!!busy || !opt}>
            {busy === 'approve' ? 'Pushing…' : 'Approve & push to Etsy'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleSimpleReject}
        onRejectAndReoptimize={handleRejectAndReoptimize}
        listingTitle={opt?.original_text ?? undefined}
      />
    </Dialog>
  )
}

function parseList(text: string | null): string[] {
  if (!text) return []
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function DiffBody({ opt }: { opt: SelectiveOpt }) {
  if (opt.type === 'tags' || opt.type === 'materials') {
    const before = parseList(opt.original_text)
    const after = parseList(opt.suggested_text)
    const beforeSet = new Set(before.map(s => s.toLowerCase()))
    const afterSet = new Set(after.map(s => s.toLowerCase()))
    return (
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Before ({before.length})</p>
          <div className="flex flex-wrap gap-1">
            {before.length === 0 && <span className="text-xs text-muted-foreground italic">none</span>}
            {before.map(t => (
              <Badge
                key={`b-${t}`}
                variant="outline"
                className={`text-xs ${!afterSet.has(t.toLowerCase()) ? 'border-red-400/50 bg-red-500/5 text-red-700 line-through' : ''}`}
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">After ({after.length})</p>
          <div className="flex flex-wrap gap-1">
            {after.map(t => (
              <Badge
                key={`a-${t}`}
                variant="secondary"
                className={`text-xs ${!beforeSet.has(t.toLowerCase()) ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700' : ''}`}
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // title / description
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-md bg-red-50 p-3 max-h-72 overflow-y-auto">
        <p className="mb-1 text-[10px] font-medium text-red-700 uppercase tracking-wide">Before</p>
        <p className="text-xs text-slate-700 whitespace-pre-wrap">{opt.original_text ?? ''}</p>
      </div>
      <div className="rounded-md bg-emerald-50 p-3 max-h-72 overflow-y-auto">
        <p className="mb-1 text-[10px] font-medium text-emerald-700 uppercase tracking-wide">After</p>
        <p className="text-xs text-slate-700 whitespace-pre-wrap">{opt.suggested_text ?? ''}</p>
      </div>
    </div>
  )
}
