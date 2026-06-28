import { useEffect, useState } from 'react'
import { HelpCircle, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * Lightweight pre-flight modal shown right before an optimization run, when
 * the backend says there are open clarifying questions for this listing.
 * Answers are merged into the listing's clarifying_answers (server-side);
 * skipped questions get a 7-day cooldown so they don't keep re-appearing.
 */
export function OptimizationPreflightModal({
  open,
  questions,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean
  questions: string[]
  busy?: boolean
  onCancel: () => void
  onSubmit: (payload: { session_answers: Record<string, string>; skipped_questions: string[] }) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Reset state whenever the modal is re-opened with a new question set.
  useEffect(() => {
    if (open) setAnswers({})
  }, [open, questions])

  const submit = () => {
    const session_answers: Record<string, string> = {}
    const skipped_questions: string[] = []
    for (const q of questions) {
      const v = (answers[q] ?? '').trim()
      if (v) session_answers[q] = v
      else skipped_questions.push(q)
    }
    onSubmit({ session_answers, skipped_questions })
  }

  const skipAll = () => onSubmit({ session_answers: {}, skipped_questions: [...questions] })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4 text-primary" />
            A few quick questions could improve this optimization
          </DialogTitle>
          <DialogDescription className="text-xs">
            Answer what you can — skip the rest. Your answers feed straight into this run and won&apos;t be re-asked for 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {questions.map((q, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs font-medium">{q}</p>
              <Textarea
                value={answers[q] ?? ''}
                onChange={(e) => setAnswers((p) => ({ ...p, [q]: e.target.value }))}
                placeholder="Your answer…"
                rows={2}
                className="text-sm"
                disabled={busy}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" size="sm" onClick={skipAll} disabled={busy} className="sm:mr-auto">
            Skip all
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {busy ? 'Optimizing…' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
