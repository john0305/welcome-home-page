import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

const STORAGE_KEY = 'riq:agency-waitlist-joined'
const FEATURE_KEY = 'agency_tier'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Variant = 'landing' | 'app'

interface Props {
  variant: Variant
}

/**
 * Subtle one-line teaser that lets a visitor (landing) or logged-in user (app)
 * join the Agency waitlist. Calls the `join-feature-waitlist` edge function so
 * anonymous email signups bypass RLS via the service role.
 */
export function AgencyWaitlistTeaser({ variant }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(variant === 'app' && !!user)

  // Persisted state for anonymous visitors
  useEffect(() => {
    if (variant === 'landing' && typeof window !== 'undefined') {
      if (localStorage.getItem(STORAGE_KEY) === '1') setJoined(true)
    }
  }, [variant])

  // Async check for logged-in users
  useEffect(() => {
    let cancelled = false
    if (variant !== 'app' || !user?.id) {
      setChecking(false)
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('feature_waitlist')
        .select('id')
        .eq('user_id', user.id)
        .eq('feature_key', FEATURE_KEY)
        .maybeSingle()
      if (!cancelled) {
        if (data) setJoined(true)
        setChecking(false)
      }
    })()
    return () => { cancelled = true }
  }, [variant, user?.id])

  const submit = async (payload: { email?: string }) => {
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('join-feature-waitlist', {
        body: { feature_key: FEATURE_KEY, ...payload },
      })
      if (fnErr || (data && (data as any).error)) {
        throw new Error((data as any)?.error || fnErr?.message || 'failed')
      }
      setJoined(true)
      setOpen(false)
      if (variant === 'landing' && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, '1')
      }
    } catch {
      setError('Something went wrong — try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLandingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) {
      setError('Please enter a valid email address.')
      return
    }
    submit({ email: v })
  }

  const handleAppClick = () => {
    if (!user) return
    submit({})
  }

  if (joined) {
    const msg = variant === 'landing'
      ? "You're on the list. We'll reach out when Agency launches."
      : "You're on the list."
    return (
      <p className="mt-6 text-center text-[13px]" style={{ color: '#5eead4' }}>
        {msg}
      </p>
    )
  }

  if (checking) {
    return <div className="mt-6 h-[18px]" aria-hidden="true" />
  }

  return (
    <div className="mt-6 text-center">
      <p className="text-[13px] text-muted-foreground">
        Managing multiple shops? Agency plan coming soon —{' '}
        {variant === 'app' ? (
          <button
            type="button"
            onClick={handleAppClick}
            disabled={submitting}
            className="inline-flex items-center gap-1 font-medium hover:underline disabled:opacity-60"
            style={{ color: 'hsl(var(--primary))' }}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Join the waitlist <ArrowRight className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 font-medium hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Join the waitlist <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </p>

      {variant === 'landing' && open && (
        <form onSubmit={handleLandingSubmit} className="mx-auto mt-3 flex max-w-md flex-col items-stretch gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null) }}
            placeholder="your@email.com"
            maxLength={255}
            required
            className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            style={{ borderColor: 'hsl(var(--primary) / 0.3)' }}
            aria-label="Email address"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {submitting ? 'Saving…' : 'Notify me'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}
