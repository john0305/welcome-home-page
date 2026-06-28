import { useState } from 'react'
import { XCircle, RefreshCw, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

export type RejectionCategory =
  | 'tone_off' | 'not_my_style' | 'factually_wrong' | 'too_salesy'
  | 'missing_context' | 'too_generic' | 'keyword_stuffing' | 'other'

const CATEGORIES: Array<{ id: RejectionCategory; label: string; description: string }> = [
  { id: 'tone_off',        label: 'Tone is off',         description: "Doesn't sound like my brand" },
  { id: 'not_my_style',   label: 'Not my style',         description: "Writing style doesn't fit" },
  { id: 'factually_wrong',label: 'Factually wrong',      description: "Incorrect product details" },
  { id: 'too_salesy',     label: 'Too salesy',           description: "Over-the-top language" },
  { id: 'missing_context',label: 'Missing context',      description: "Ignored key details" },
  { id: 'too_generic',    label: 'Too generic',          description: "Could apply to any listing" },
  { id: 'keyword_stuffing',label:'Keyword stuffing',     description: "Unnatural keyword use" },
  { id: 'other',          label: 'Other',                description: "Something else" },
]

interface RejectModalProps {
  open: boolean
  onClose: () => void
  /** Simple reject — save feedback only, no re-run */
  onReject: (category: RejectionCategory, comment: string) => void
  /**
   * Reject and immediately re-optimize with the provided instructions.
   * When present, the "Re-optimize Now" primary action is shown.
   */
  onRejectAndReoptimize?: (instructions: string) => Promise<void>
  listingTitle?: string
}

export function RejectModal({
  open, onClose, onReject, onRejectAndReoptimize, listingTitle,
}: RejectModalProps) {
  const [instructions, setInstructions] = useState('')
  const [category, setCategory] = useState<RejectionCategory | null>(null)
  const [showSimpleReject, setShowSimpleReject] = useState(false)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const reset = () => {
    setInstructions('')
    setCategory(null)
    setShowSimpleReject(false)
    setBusy(false)
  }

  const handleClose = () => { reset(); onClose() }

  const handleReoptimize = async () => {
    if (!instructions.trim()) {
      toast({ title: 'Write your instructions first', description: 'Tell the AI exactly what to change.', variant: 'destructive' })
      return
    }
    if (!onRejectAndReoptimize) return
    setBusy(true)
    try {
      await onRejectAndReoptimize(instructions.trim())
      reset()
      onClose()
    } catch (e) {
      toast({ title: 'Re-optimization failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const handleSimpleReject = () => {
    const cat = category ?? 'other'
    const comment = instructions.trim()
      ? (category ? `${cat}: ${instructions.trim()}` : instructions.trim())
      : (category ? cat : '')
    onReject(cat, comment)
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#f59e0b' }}>
            <XCircle className="h-5 w-5" />
            Needs Changes
          </DialogTitle>
          <DialogDescription>
            {listingTitle
              ? `What needs to change in "${listingTitle.slice(0, 50)}${listingTitle.length > 50 ? '…' : ''}"?`
              : 'What needs to change?'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Primary mode — specific instructions for immediate re-run */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-white">
              What should the AI fix?
            </Label>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Tell the AI what to fix and it'll rewrite the listing with your notes as hard requirements — applied across title, description, tags, and materials.
            </p>
            <Textarea
              rows={4}
              placeholder={
                `e.g. Do NOT mention Bronze anywhere — not in the title, description, tags, or materials. The main metal is sterling silver. Also remove any "copper" tags and replace them with "sterling silver" and "oxidized silver".`
              }
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="text-sm"
              style={{
                borderColor: instructions.trim() ? 'rgba(0,196,175,0.40)' : undefined,
                resize: 'vertical',
              }}
              autoFocus
            />
            {instructions.trim() && (
              <p className="text-[10px]" style={{ color: '#00C4AF' }}>
                ✓ The AI will treat this as a hard requirement across all fields.
              </p>
            )}
          </div>

          {/* Secondary mode — just reject without re-running */}
          {onRejectAndReoptimize && (
            <div>
              <button
                type="button"
                onClick={() => setShowSimpleReject(s => !s)}
                className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform"
                  style={{ transform: showSimpleReject ? 'rotate(180deg)' : 'none' }}
                />
                Discard without re-running
              </button>

              {showSimpleReject && (
                <div className="mt-3 space-y-2 border rounded-lg p-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
                  <Label className="text-xs text-muted-foreground">Reason</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.id}
                        className={`rounded-lg border p-2 text-left transition-all hover:border-primary/50 ${category === c.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                        onClick={() => setCategory(c.id)}
                      >
                        <p className="text-xs font-semibold">{c.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{c.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>

          {/* Simple reject — only shown when expanded, or when no re-optimize handler */}
          {(!onRejectAndReoptimize || showSimpleReject) && (
            <Button
              variant="destructive"
              onClick={handleSimpleReject}
              disabled={busy}
            >
              {category ? 'Discard & save feedback' : 'Discard optimization'}
            </Button>
          )}

          {/* Primary: reject + re-optimize */}
          {onRejectAndReoptimize && (
            <Button
              onClick={handleReoptimize}
              disabled={busy || !instructions.trim()}
              className="gap-2"
              style={{ background: '#00C4AF', color: '#000' }}
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {busy ? 'Re-optimizing…' : 'Redo with Changes →'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
