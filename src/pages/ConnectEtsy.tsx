import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Store, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { EtsyDisclaimer } from '@/components/EtsyDisclaimer'
import { completeOnboardingStep } from '@/types/onboarding'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

type Step = 'connect' | 'done' | 'error'

export default function ConnectEtsy() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('connect')
  const [shopName, setShopName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState('')

  const callbackError = searchParams.get('error')
  const autoStart = searchParams.get('auto') === '1'

  const loadedForUserIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    if (loadedForUserIdRef.current === user.id) return
    loadedForUserIdRef.current = user.id
    ;(async () => {
      setIsFetching(true)
      const { data: token } = await supabase
        .from('etsy_connection_status')
        .select('shop_id, shop_name, expires_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (token) {
        setShopName(token.shop_name ?? null)
        const expired = token.expires_at && new Date(token.expires_at).getTime() < Date.now()
        // Already-connected but expired + ?auto=1 → kick straight into re-auth
        if (expired && autoStart) {
          setIsFetching(false)
          void handleConnect()
          return
        }
        setStep('done')
        completeOnboardingStep('connect_store')
        window.dispatchEvent(new Event('radariq:onboarding-updated'))
      } else if (autoStart) {
        setIsFetching(false)
        void handleConnect()
        return
      }
      setIsFetching(false)
    })()
  }, [user?.id])

  useEffect(() => {
    if (callbackError) {
      setStep('error')
      setError(`Etsy authorization failed: ${callbackError}`)
    }
  }, [callbackError])

  const handleConnect = async () => {
    setError('')
    setIsLoading(true)
    try {
      const returnUrl = window.location.origin
      const { data, error: invErr } = await supabase.functions.invoke('etsy-oauth', {
        method: 'GET',
        // @ts-expect-error supabase-js v2 supports query for GET
        query: { action: 'authorize', return_url: returnUrl },
      })
      let url: string | undefined = (data as { url?: string } | null)?.url
      if (invErr || !url) {
        const session = (await supabase.auth.getSession()).data.session
        const r = await fetch(
          `${SUPABASE_URL}/functions/v1/etsy-oauth?action=authorize&return_url=${encodeURIComponent(returnUrl)}`,
          { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } },
        )
        const json = await r.json()
        if (!r.ok || !json.url) throw new Error(json.error || 'Failed to start OAuth')
        url = json.url
      }
      window.location.href = url!
    } catch (err) {
      setIsLoading(false)
      setError((err as Error).message)
      toast({
        title: 'Could not start Etsy authorization',
        description: (err as Error).message,
        variant: 'destructive',
      })
    }
  }

  if (isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-etsy/10">
            {step === 'done'
              ? <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              : <Store className="h-7 w-7 text-etsy" />}
          </div>
          <CardTitle>
            {step === 'done' ? 'Etsy Store Connected'
              : step === 'error' ? 'Connection Failed'
              : 'Connect Your Etsy Store'}
          </CardTitle>
          <CardDescription>
            {step === 'done'
              ? 'Your store is connected. RadarIQ refreshes access automatically.'
              : 'Connect your Etsy store to sync listings, track performance, and unlock all RadarIQ features.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'connect' && (
            <>
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">RadarIQ will request access to:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Read your active listings and images</li>
                  <li>Update listing titles, descriptions, tags, and materials</li>
                  <li>Read your sales and receipts history</li>
                </ul>
                <p className="pt-1">You'll approve these permissions on Etsy's own page.</p>
              </div>
              <Button
                className="w-full gap-2"
                variant="etsy"
                onClick={handleConnect}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                {isLoading ? 'Connecting…' : 'Connect Etsy Store'}
              </Button>
            </>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                ✓ {shopName ? `${shopName} connected.` : 'Store connected.'} Tokens refresh automatically.
              </div>
              <Button className="w-full" onClick={() => navigate('/app/dashboard')}>
                Go to Dashboard
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleConnect}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Reconnect
              </Button>
            </div>
          )}

          {step === 'error' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setStep('connect'); setError('') }}
            >
              Try again
            </Button>
          )}

          <div className="text-center">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                // Without this flag, OnboardingRedirects bounces unconnected
                // users straight back here — "Skip" looped instead of skipping.
                try { sessionStorage.setItem('radariq_connect_skipped', '1') } catch { /* ignore */ }
                navigate('/app/dashboard')
              }}
            >
              Skip for now
            </Button>
          </div>

          <EtsyDisclaimer variant="inline" className="mt-2" />
        </CardContent>
      </Card>
    </div>
  )
}
