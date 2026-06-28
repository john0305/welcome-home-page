import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

/**
 * Inline feedback form mounted inside Echo's panel.
 * Logs structured feedback to the console (existing pattern from SupportWidget)
 * so the support team's pipeline can pick it up.
 */
export function EchoFeedbackForm() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [type, setType] = useState<'bug' | 'feedback'>('feedback')
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSend = () => {
    if (!text.trim()) {
      toast({ title: 'Add a bit more detail first', variant: 'destructive' })
      return
    }
    console.log('Radar IQ feedback:', {
      type,
      message: text.trim(),
      user_id: user?.id,
      email: user?.email,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setText('')
    }, 2500)
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-xs text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Thanks — got it.
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-1">
        {(['feedback', 'bug'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="text-[10px] uppercase tracking-wider font-semibold rounded px-2 py-1 transition-colors"
            style={
              type === t
                ? { background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }
                : { background: 'transparent', color: 'hsl(var(--muted-foreground))' }
            }
          >
            {t === 'feedback' ? 'Feature idea' : 'Report bug'}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        placeholder={type === 'bug' ? 'What broke? Steps to reproduce help a lot.' : 'What would make Radar IQ better for you?'}
        rows={3}
        className="w-full resize-none rounded-md bg-surface-2 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none p-2 border"
        style={{ borderColor: 'hsl(var(--border))' }}
      />
      <button
        onClick={handleSend}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md py-1.5 text-foreground"
        style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #00BDB2)' }}
      >
        <Send className="h-3 w-3" /> Send
      </button>
    </div>
  )
}
