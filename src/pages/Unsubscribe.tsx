import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'ready' | 'confirming' | 'done' | 'already' | 'invalid'

export default function Unsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')

  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string | undefined
  const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    if (!supabaseUrl || !anonKey) { setStatus('invalid'); setError('Configuration error'); return }
    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: anonKey },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) setStatus('ready')
        else if (data.reason === 'already_unsubscribed') setStatus('already')
        else { setStatus('invalid'); setError(data.error ?? 'Invalid link') }
      })
      .catch(() => { setStatus('invalid'); setError('Network error') })
  }, [token, supabaseUrl, anonKey])

  const confirm = async () => {
    if (!token || !supabase) return
    setStatus('confirming')
    const { data, error: invokeError } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } })
    if (invokeError) { setStatus('invalid'); setError(invokeError.message); return }
    if (data?.success) setStatus('done')
    else if (data?.reason === 'already_unsubscribed') setStatus('already')
    else { setStatus('invalid'); setError(data?.error ?? 'Could not unsubscribe') }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: "hsl(var(--background))", fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md text-center text-foreground">
        <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
          Email preferences
        </h1>
        {status === 'loading' && <p style={{ color: 'hsl(var(--muted-foreground))' }}>Checking your link...</p>}
        {status === 'ready' && (
          <>
            <p className="mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>Click confirm to stop receiving emails from Radar IQ.</p>
            <button onClick={confirm} className="inline-flex items-center justify-center w-full h-11 rounded-xl font-bold text-foreground"
              style={{ background: "hsl(var(--primary))", boxShadow: '0 8px 24px hsl(var(--primary) / 0.25)' }}>
              Confirm unsubscribe
            </button>
          </>
        )}
        {status === 'confirming' && <p style={{ color: 'hsl(var(--muted-foreground))' }}>Unsubscribing...</p>}
        {status === 'done' && <p style={{ color: 'hsl(var(--primary))' }}>You've been unsubscribed.</p>}
        {status === 'already' && <p style={{ color: 'hsl(var(--muted-foreground))' }}>You're already unsubscribed.</p>}
        {status === 'invalid' && <p style={{ color: '#f87171' }}>{error || 'This link is invalid or has expired.'}</p>}
        <div className="mt-8 text-xs"><Link to="/" style={{ color: 'hsl(var(--muted-foreground))' }}>Back to radariq.app</Link></div>
      </div>
    </div>
  )
}
