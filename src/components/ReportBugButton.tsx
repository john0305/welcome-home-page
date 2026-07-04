/**
 * ReportBugButton — persistent, always-visible bug-report entry point for the
 * beta phase (UX brief Section 3). Floats bottom-left on every authenticated
 * page — deliberately away from Echo (bottom-right / bottom-center) and the
 * score toast (bottom-right). Low-friction: one tap opens the same feedback
 * form as the sidebar's "Share Feedback", pre-framed as a bug report.
 */
import { useState } from 'react'
import { Bug } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EchoFeedbackForm } from '@/components/echo/EchoFeedbackForm'

export function ReportBugButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="fixed left-3 z-40 flex items-center gap-1.5 rounded-full border border-border bg-surface-1/95 backdrop-blur px-3 py-2 text-[11px] font-semibold text-muted-foreground shadow-warm-sm hover:text-foreground hover:border-primary/30 hover:bg-surface-2 active:scale-95 transition-all"
        style={{
          // Clear the mobile bottom nav; hug the corner on desktop.
          bottom: 'calc(env(safe-area-inset-bottom) + 72px)',
        }}
      >
        <Bug className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Report a bug</span>
      </button>
      <style>{`
        @media (min-width: 768px) {
          [aria-label="Report a bug"] { bottom: 16px !important; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Report a bug</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-1">
            Something broken, confusing, or just off? Tell us what happened — it goes straight to the team, screenshots of what you typed included.
          </p>
          <EchoFeedbackForm />
        </DialogContent>
      </Dialog>
    </>
  )
}
