import { useState } from 'react'
import { Mail, ArrowRight, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { getStoredTheme } from '@/lib/theme'

export default function BetaSignupForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('loading')
    try {
      const { error } = await supabase
        .from('beta_signups')
        .insert({ email: email.trim().toLowerCase(), preferred_theme: getStoredTheme() } as any)

      if (error) {
        if (error.code === '23505') {
          setStatus('success')
          setMessage("You're already on the list! We'll be in touch.")
        } else {
          throw error
        }
      } else {
        setStatus('success')
        setMessage("You're on the list! Watch your inbox for early access.")
      }
      setEmail('')
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <Check className="h-5 w-5" style={{ color: '#10b981' }} />
        <p className="text-sm font-medium" style={{ color: '#10b981' }}>{message}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
      <div className="relative flex-grow">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <input
          type="email"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none transition-all"
          style={{
            background: 'hsl(var(--surface-2))',
            border: status === 'error' ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid hsl(var(--border))',
          }}
          disabled={status === 'loading'}
        />
      </div>
      <button
        type="submit"
        disabled={status === 'loading'}
        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
        style={{ background: 'hsl(var(--primary))', color: "hsl(var(--background))" }}
      >
        {status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Join Waitlist <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      {status === 'error' && (
        <p className="text-xs mt-2 sm:mt-0 sm:absolute sm:-bottom-5 sm:left-0 sm:right-0 text-center" style={{ color: '#ef4444' }}>{message}</p>
      )}
    </form>
  )
}
