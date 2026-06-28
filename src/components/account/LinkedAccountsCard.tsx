import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { CheckCircle2, Link2, Unlink, AlertCircle } from 'lucide-react'

type Identity = {
  identity_id?: string
  id: string
  provider: string
  email?: string
  created_at?: string
}

export function LinkedAccountsCard() {
  const { toast } = useToast()
  const [identities, setIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.getUserIdentities()
    if (error) setError(error.message)
    else setIdentities((data?.identities ?? []) as Identity[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const googleLinked = identities.some(i => i.provider === 'google')
  const emailLinked = identities.some(i => i.provider === 'email')

  const linkGoogle = async () => {
    setBusy('google'); setError(null)
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      toast({ title: 'Could not link Google', description: error.message, variant: 'destructive' })
      setBusy(null)
    }
    // On success the browser redirects to Google.
  }

  const unlink = async (identity: Identity) => {
    if (identities.length <= 1) {
      toast({
        title: 'Cannot unlink',
        description: 'You must keep at least one sign-in method.',
        variant: 'destructive',
      })
      return
    }
    setBusy(identity.provider); setError(null)
    const { error } = await supabase.auth.unlinkIdentity(identity as any)
    if (error) {
      setError(error.message)
      toast({ title: 'Could not unlink', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: `${identity.provider} unlinked` })
      await load()
    }
    setBusy(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linked sign-in methods</CardTitle>
        <CardDescription>
          Link Google to your account so you can sign in either way. Both methods will access the same account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Email / password */}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">@</div>
            <div>
              <p className="text-sm font-medium">Email & password</p>
              <p className="text-xs text-muted-foreground">
                {emailLinked ? 'Linked' : 'Not linked'}
              </p>
            </div>
          </div>
          {emailLinked && <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Linked</Badge>}
        </div>

        {/* Google */}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-3">
            <svg className="h-8 w-8" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {googleLinked ? (identities.find(i => i.provider === 'google')?.email ?? 'Linked') : 'Not linked'}
              </p>
            </div>
          </div>
          {googleLinked ? (
            <div className="flex items-center gap-2">
              <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Linked</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === 'google' || identities.length <= 1}
                onClick={() => unlink(identities.find(i => i.provider === 'google')!)}
              >
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Unlink
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy === 'google' || loading} onClick={linkGoogle}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {busy === 'google' ? 'Redirecting…' : 'Link Google'}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Linking requires you to be signed in. You'll be redirected to Google to confirm.
        </p>
      </CardContent>
    </Card>
  )
}
