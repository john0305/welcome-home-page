import { useMemo, useState } from 'react'
import { HelpCircle, Loader2, Check, X, Clock, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * Surfaced on ListingDetail. Two modes:
 *  - "Unanswered": shows the latest set of AI-generated questions and lets the
 *    seller answer them. Answers get written into `clarifying_answers` (used by
 *    the grader + optimizer) AND into the matching `clarifying_history` entries.
 *  - "History": always available via the small toggle. Lets the seller cycle
 *    through every Q&A this listing has ever had (newest first) and edit any
 *    answer. The grader sees the history so it won't re-ask the same question.
 */

export type ClarifyingHistoryEntry = {
  question: string
  answer: string | null
  asked_at?: string | null
  answered_at?: string | null
  updated_at?: string | null
  skipped_at?: string | null
}

export function ClarifyingQuestionsCard({
  listingId,
  questions,
  existingAnswers,
  history,
  onSaved,
}: {
  listingId: string
  questions: string[]
  existingAnswers?: Record<string, string> | null
  history?: ClarifyingHistoryEntry[] | null
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const safeHistory = useMemo<ClarifyingHistoryEntry[]>(() => Array.isArray(history) ? history : [], [history])
  const unansweredQuestions = useMemo(
    () => questions.filter(q => !(existingAnswers?.[q] ?? '').trim()),
    [questions, existingAnswers],
  )

  // Answered history, newest first, for the cycle UI.
  const answeredHistory = useMemo(
    () => [...safeHistory]
      .filter(h => (h.answer ?? '').trim().length > 0)
      .sort((a, b) => {
        const ta = a.answered_at || a.updated_at || a.asked_at || ''
        const tb = b.answered_at || b.updated_at || b.asked_at || ''
        return tb.localeCompare(ta)
      }),
    [safeHistory],
  )

  const startInUnanswered = unansweredQuestions.length > 0
  const [mode, setMode] = useState<'unanswered' | 'history'>(startInUnanswered ? 'unanswered' : 'history')

  // ── Unanswered mode state ─────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string>>(() => existingAnswers ?? {})
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // ── History mode state ────────────────────────────────────────────────────
  const [historyIndex, setHistoryIndex] = useState(0)
  const safeIndex = Math.min(historyIndex, Math.max(0, answeredHistory.length - 1))
  const current = answeredHistory[safeIndex]
  const [draftAnswer, setDraftAnswer] = useState<string>(current?.answer ?? '')
  const [updating, setUpdating] = useState(false)
  // Reset draft when the active history entry changes.
  useMemo(() => { setDraftAnswer(current?.answer ?? '') }, [current?.question])

  // Nothing to show at all → render nothing.
  if (unansweredQuestions.length === 0 && answeredHistory.length === 0) return null

  // ── Save handler (unanswered) ─────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    const nextAnswers: Record<string, string> = { ...(existingAnswers ?? {}) }
    for (const q of unansweredQuestions) {
      const v = (answers[q] ?? '').trim()
      if (v) nextAnswers[q] = v
    }
    const nowIso = new Date().toISOString()
    const nextHistory: ClarifyingHistoryEntry[] = safeHistory.map(h => {
      const v = (answers[h.question] ?? '').trim()
      if (v && (h.answer ?? '') !== v) {
        return { ...h, answer: v, answered_at: h.answered_at ?? nowIso, updated_at: nowIso }
      }
      return h
    })
    // For any answered question that isn't yet in history (legacy answers),
    // append a backfill entry so the cycle UI shows it.
    for (const q of unansweredQuestions) {
      const v = (answers[q] ?? '').trim()
      if (!v) continue
      if (!nextHistory.some(h => h.question === q)) {
        nextHistory.push({ question: q, answer: v, asked_at: nowIso, answered_at: nowIso, updated_at: nowIso, skipped_at: null })
      }
    }
    const { error } = await supabase
      .from('listings')
      .update({
        clarifying_answers: nextAnswers,
        clarifying_questions: null,
        clarifying_history: nextHistory as never,
      })
      .eq('id', listingId)
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      return
    }
    toast({
      title: 'Saved',
      description: 'Your answers will be used on the next grade and optimization.',
      variant: 'success',
    })
    onSaved?.()
  }

  // ── Skip handler ──────────────────────────────────────────────────────────
  const skip = async () => {
    setSkipping(true)
    const nowIso = new Date().toISOString()
    const nextHistory = safeHistory.map(h =>
      unansweredQuestions.includes(h.question) && !(h.answer ?? '').trim()
        ? { ...h, skipped_at: nowIso }
        : h
    )
    const { error } = await supabase
      .from('listings')
      .update({ clarifying_questions: null, clarifying_history: nextHistory as never })
      .eq('id', listingId)
    setSkipping(false)
    if (error) {
      toast({ title: 'Could not skip', description: error.message, variant: 'destructive' })
      return
    }
    toast({
      title: 'Skipped',
      description: 'The AI won\'t re-ask these. Re-grade to see if it has different questions.',
      variant: 'success',
    })
    onSaved?.()
  }

  // ── Update handler (history) ──────────────────────────────────────────────
  const updateHistoryAnswer = async () => {
    if (!current) return
    const v = draftAnswer.trim()
    if (!v) return
    setUpdating(true)
    const nowIso = new Date().toISOString()
    const nextAnswers = { ...(existingAnswers ?? {}), [current.question]: v }
    const nextHistory = safeHistory.map(h =>
      h.question === current.question ? { ...h, answer: v, updated_at: nowIso } : h
    )
    const { error } = await supabase
      .from('listings')
      .update({ clarifying_answers: nextAnswers, clarifying_history: nextHistory as never })
      .eq('id', listingId)
    setUpdating(false)
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Answer updated', variant: 'success' })
    onSaved?.()
  }

  // ── Snoozed UI ────────────────────────────────────────────────────────────
  if (dismissed && mode === 'unanswered') {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>Clarifying questions snoozed</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(false)}>Show</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const showingHistory = mode === 'history' || unansweredQuestions.length === 0
  const headerTitle = showingHistory ? 'Past clarifying answers' : 'Help the AI grade this listing better'
  const canToggleToHistory = answeredHistory.length > 0 && unansweredQuestions.length > 0
  const canToggleToUnanswered = mode === 'history' && unansweredQuestions.length > 0

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-primary" />
            {headerTitle}
          </span>
          {canToggleToHistory && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode('history')}>
              View past answers ({answeredHistory.length})
            </Button>
          )}
          {canToggleToUnanswered && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode('unanswered')}>
              Answer new questions ({unansweredQuestions.length})
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {showingHistory ? (
          // ── History mode ────────────────────────────────────────────────
          answeredHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No answers yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={safeIndex <= 0}
                  onClick={() => setHistoryIndex(i => Math.max(0, i - 1))}
                  aria-label="Previous answer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {safeIndex + 1} of {answeredHistory.length}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={safeIndex >= answeredHistory.length - 1}
                  onClick={() => setHistoryIndex(i => Math.min(answeredHistory.length - 1, i + 1))}
                  aria-label="Next answer"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs font-medium">{current?.question}</p>
              <Textarea
                value={draftAnswer}
                onChange={e => setDraftAnswer(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {current?.answered_at && `Answered ${new Date(current.answered_at).toLocaleDateString()}`}
                  {current?.updated_at && current.updated_at !== current.answered_at && ` · Updated ${new Date(current.updated_at).toLocaleDateString()}`}
                </span>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={updating || !draftAnswer.trim() || draftAnswer.trim() === (current?.answer ?? '').trim()}
                  onClick={updateHistoryAnswer}
                >
                  {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  {updating ? 'Updating…' : 'Update answer'}
                </Button>
              </div>
            </div>
          )
        ) : (
          // ── Unanswered mode ─────────────────────────────────────────────
          <>
            <p className="text-xs text-muted-foreground">
              The AI flagged {unansweredQuestions.length === 1 ? 'a question' : 'these questions'} about your listing. Answering will improve the next grade and the next optimization.
            </p>
            {unansweredQuestions.map((q, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-medium">{q}</p>
                <Textarea
                  value={answers[q] ?? ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                  placeholder="Your answer…"
                  rows={2}
                  className="text-sm"
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={saving || !unansweredQuestions.some(q => (answers[q] ?? '').trim())}
                onClick={save}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save answers'}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setDismissed(true)}>
                <Clock className="h-3.5 w-3.5" />
                Answer later
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive" disabled={skipping} onClick={skip}>
                {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                {skipping ? 'Skipping…' : 'Skip'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
