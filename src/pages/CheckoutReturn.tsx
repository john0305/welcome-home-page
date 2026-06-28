import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/integrations/supabase/client'
import { getStripeEnvironment } from '@/lib/payments'

// Stripe Embedded Checkout loads return_url inside its iframe. Talk to the
// parent app first so auth state is preserved, then fall back to navigation.
function parentGo(path: string, sessionId?: string | null) {
  try {
    if (window.parent && window.parent !== window.self) {
      window.parent.postMessage({ type: 'RADARIQ_CHECKOUT_COMPLETE', path, sessionId }, window.location.origin)
      return
    }
  } catch {
    /* cross-origin parent — fall through */
  }
  window.location.href = path
}

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [autoRedirectIn, setAutoRedirectIn] = useState(7)

  useEffect(() => {
    if (!sessionId) return
    const path = `/app/settings?tab=billing&checkout=success&session_id=${encodeURIComponent(sessionId)}`
    let cancelled = false

    const fallback = window.setTimeout(() => {
      if (!cancelled) parentGo(path, sessionId)
    }, 7000)

    const syncCheckout = async () => {
      try {
        await supabase.functions.invoke('sync-checkout-session', {
          body: { sessionId, environment: getStripeEnvironment() },
        })
      } catch (error) {
        console.error('Checkout sync failed; webhook polling will continue after redirect.', error)
      }

      if (!cancelled) {
        window.clearTimeout(fallback)
        parentGo(path, sessionId)
      }
    }

    void syncCheckout()
    const interval = setInterval(() => {
      setAutoRedirectIn(n => {
        if (n <= 1) {
          clearInterval(interval)
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => {
      cancelled = true
      window.clearTimeout(fallback)
      clearInterval(interval)
    }
  }, [sessionId])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {sessionId ? (
            <>
              <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold">Payment successful</h1>
              <p className="text-sm text-muted-foreground inline-flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Activating your plan… redirecting in {autoRedirectIn}s
              </p>
              <Button className="w-full" onClick={() => parentGo(`/app/settings?tab=billing&checkout=success${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`, sessionId)}>
                Go to billing now
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => parentGo('/app/dashboard', sessionId)}>
                Open dashboard
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold">No session found</h1>
              <Button onClick={() => parentGo('/app/settings?tab=billing')}>Back to billing</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
