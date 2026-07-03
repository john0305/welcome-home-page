import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, Loader2, Plug } from 'lucide-react'
import { supabase as typedSupabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { canUseTierOnly } from '@/lib/tier-access'
import { useNavigate } from 'react-router-dom'

// integration_connections lands in generated types when Lovable applies
// migration 20260702000007; untyped-client pattern until then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = typedSupabase as any

interface ConnectionRow {
  provider: string
  status: string
  external_account_id: string | null
  metadata: { property_display_name?: string } | null
}

const PROVIDERS: { key: string; label: string; blurb: string }[] = [
  {
    key: 'google_analytics',
    label: 'Google Analytics',
    blurb: "See how traffic from your own site and socials feeds your shop — insights land right in your action queue.",
  },
]

/**
 * Connected data sources (Section 10). The connect flow goes through the
 * integration-oauth edge function; tokens never touch the browser. Insights
 * from connected sources flow into the same action queue as everything else.
 */
export function IntegrationsCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  // Pro feature (tier map: "more integrations" is the honest paid step-up;
  // core Etsy insights stay free). Server enforces the same gate.
  const tierAllows = canUseTierOnly(user?.tier, 'data_integrations')

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('integration_connections')
      .select('provider, status, external_account_id, metadata')
      .eq('user_id', user.id)
      .then(({ data }: { data: ConnectionRow[] | null }) => setConnections(data ?? []))
  }, [user?.id])

  // Surface the result of an OAuth round-trip (?integration_connected / _error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('integration_connected')
    const error = params.get('integration_error')
    if (!connected && !error) return
    if (connected) {
      toast({ title: 'Connected!', description: 'First data pull is running — insights appear after the next scan.', variant: 'success' })
    } else {
      toast({ title: "Couldn't connect", description: `The provider returned: ${error}`, variant: 'destructive' })
    }
    params.delete('integration_connected')
    params.delete('integration_error')
    const rest = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  }, [toast])

  const connect = async (provider: string) => {
    setBusy(provider)
    try {
      const { data, error } = await supabase.functions.invoke(
        `integration-oauth?action=authorize&provider=${provider}&return_url=${encodeURIComponent(window.location.origin)}`,
        { method: 'POST' },
      )
      if (error || !data?.url) throw error ?? new Error('No auth URL returned')
      window.location.assign(data.url as string)
    } catch (e) {
      toast({
        title: "Couldn't start the connection",
        description: e instanceof Error ? e.message : 'Give it another try in a moment.',
        variant: 'destructive',
      })
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> Connected data sources
        </CardTitle>
        <CardDescription>
          Bring your outside-Etsy data in — it feeds the same insights and action queue as your shop data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROVIDERS.map(p => {
          const conn = connections.find(c => c.provider === p.key)
          const isConnected = conn?.status === 'connected'
          return (
            <div key={p.key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {isConnected
                      ? `Connected${conn?.metadata?.property_display_name ? ` — ${conn.metadata.property_display_name}` : ''}`
                      : p.blurb}
                  </p>
                </div>
              </div>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 shrink-0">
                  <CheckCircle2 className="h-4 w-4" /> Connected
                </span>
              ) : tierAllows ? (
                <Button
                  size="sm"
                  onClick={() => void connect(p.key)}
                  disabled={busy === p.key}
                  className="shrink-0"
                >
                  {busy === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Connect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/app/settings?tab=billing')}
                  className="shrink-0"
                >
                  Available on Pro
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
