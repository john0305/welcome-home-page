import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Settings2, Database, Key, BarChart3, Cloud, Share2, User, Bell, Store,
  CheckCircle2, XCircle, AlertCircle, ExternalLink, Copy, Eye, EyeOff, ChevronRight,
  CreditCard, Check, Zap, Lock, Sparkles, RotateCcw
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { PLAN_PRICE_IDS, PLANS, isPaymentsConfigured, getStripeEnvironment } from '@/lib/payments'
import { useStripeCheckout } from '@/hooks/useStripeCheckout'
import { AgencyWaitlistTeaser } from '@/components/upgrade/AgencyWaitlistTeaser'

// Feature flag — flip VITE_SHOW_AGENCY_TIER to 'true' to re-enable Agency.
const SHOW_AGENCY_TIER = import.meta.env.VITE_SHOW_AGENCY_TIER === 'true'
import { useSubscription } from '@/hooks/useSubscription'
import { supabase } from '@/integrations/supabase/client'
import { InviteCodeCard } from '@/components/account/InviteCodeCard'
import { LinkedAccountsCard } from '@/components/account/LinkedAccountsCard'
import { PlanBadge } from '@/components/account/PlanBadge'
import { DEFAULT_AI_MODELS, type AITask, type AIModelTier } from '@/types'
import { Link } from 'react-router-dom'
import { SanityCheckSettings } from '@/components/settings/SanityCheckSettings'
import { IntegrationsCard } from '@/components/account/IntegrationsCard'
import { useViewMode } from '@/hooks/useViewMode'
import { getThemeState, getShopMatchedTheme, lockTheme, resetToShopMatch, type ColorTheme } from '@/lib/themeAdaptation'

const AI_TASKS: Array<{ key: AITask; label: string; helper: string }> = [
  { key: 'grading', label: 'Listing grading', helper: 'Scores each listing across photos, tags, title, description.' },
  { key: 'titles_tags', label: 'Titles & tags', helper: 'Rewrites your title and picks tags people are actually searching.' },
  { key: 'descriptions', label: 'Descriptions', helper: 'Rewrites the long product description so it reads better and ranks better.' },
  { key: 'bulk_insights', label: 'Bulk insights', helper: 'Trends, patterns, and weekly summaries across your whole shop.' },
]

function ProfileForm() {
  const { user, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setFullName(user?.full_name ?? '') }, [user?.full_name])
  const canEditEmail = !user?.email
  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    const { error } = await supabase.from('user_profiles').update({ full_name: fullName }).eq('id', user.id)
    setSaving(false)
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' })
      return
    }
    await refreshProfile()
    toast({ title: 'Profile updated', variant: 'success' })
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input value={user?.username ?? ''} disabled />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input defaultValue={user?.email ?? ''} type="email" disabled={!canEditEmail} />
      </div>
      <Button onClick={handleSave} disabled={saving || fullName === (user?.full_name ?? '')}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </>
  )
}


function AIModelsBlock() {
  const { user } = useAuth()
  const isPaid = !!user?.tier && user.tier !== 'free'
  const initial = { ...DEFAULT_AI_MODELS, ...(user?.settings.ai_models ?? {}) }
  const [models, setModels] = useState<Record<AITask, AIModelTier>>(initial)

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI models
          </p>
          <p className="text-xs text-muted-foreground">
            Flash is fast and light — great for high-volume jobs. Pro is slower but more thoughtful — better when wording really matters.
          </p>
        </div>
        {isPaid && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setModels(DEFAULT_AI_MODELS)}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {!isPaid && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/8 p-2.5 text-xs">
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1">You're on Free, so everything runs on Flash. Upgrade to mix in Pro where it counts.</span>
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to="/app/settings?tab=billing">Upgrade</Link>
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {AI_TASKS.map(task => {
          const value: AIModelTier = isPaid ? models[task.key] : 'flash'
          return (
            <div key={task.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{task.label}</p>
                <p className="text-xs text-muted-foreground truncate">{task.helper}</p>
              </div>
              <Select
                value={value}
                disabled={!isPaid}
                onValueChange={(v: AIModelTier) => setModels(m => ({ ...m, [task.key]: v }))}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flash">Flash</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Appearance card (dark mode + theme color) ──────────────────────────────
const THEME_COLORS = [
  { id: 'forest',   label: 'Forest',   color: '#1A6B5A' },
  { id: 'ocean',    label: 'Ocean',    color: '#1E5F8E' },
  { id: 'sunset',   label: 'Sunset',   color: '#C2553A' },
  { id: 'lavender', label: 'Lavender', color: '#6B5E9E' },
]

function AppearanceCard() {
  const { mode: viewMode, setMode: setViewMode } = useViewMode()
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('radariq_theme') === 'dark' } catch { return false }
  })
  // Reflect the real adaptation state (manual lock vs auto-matched to shop).
  const [themeState, setThemeState] = useState(() => getThemeState())
  const colorTheme = themeState.active
  const shopMatched = getShopMatchedTheme()

  const toggleDark = (val: boolean) => {
    setDark(val)
    if (val) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('radariq_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('radariq_theme', 'light')
    }
  }

  const pickColor = (id: string) => {
    lockTheme(id as ColorTheme)          // manual choice — permanently wins over auto
    setThemeState(getThemeState())
  }

  const matchToShop = () => {
    resetToShopMatch()                   // clear the lock, re-skin from shop aesthetic
    setThemeState(getThemeState())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>🎨</span> Appearance
        </CardTitle>
        <CardDescription>Choose your preferred look and feel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Simple vs Advanced view (Section 7 two-mode system) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Detail level</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simple keeps things focused on your next moves; Advanced shows every score, filter, and breakdown.
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            {(['simple', 'advanced'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'simple' ? 'Simple' : 'Advanced'}
              </button>
            ))}
          </div>
        </div>

        {/* Dark mode */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Dark mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">Switch to a darker interface for low-light use.</p>
          </div>
          <Switch checked={dark} onCheckedChange={toggleDark} />
        </div>

        {/* Theme color */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-sm font-medium">Theme color</p>
            {themeState.mode === 'auto' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" /> Matched to your shop
              </span>
            )}
            {themeState.mode === 'manual' && shopMatched && shopMatched !== colorTheme && (
              <button
                type="button"
                onClick={matchToShop}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Match to my shop
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {themeState.mode === 'auto'
              ? "We picked an accent that fits your shop's vibe. Choose one below to lock in your own."
              : 'Changes the accent color across the interface.'}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {THEME_COLORS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickColor(t.id)}
                className="flex flex-col items-center gap-1.5 group"
                title={t.label}
              >
                <div
                  className="h-9 w-9 rounded-full border-2 transition-all flex items-center justify-center"
                  style={{
                    background: t.color,
                    borderColor: colorTheme === t.id ? t.color : 'transparent',
                    boxShadow: colorTheme === t.id ? `0 0 0 3px ${t.color}40` : 'none',
                  }}
                >
                  {colorTheme === t.id && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : <XCircle className="h-4 w-4 text-red-500" />
}

function ConnectionCard({ title, description, connected, setupSteps, docsUrl, children }: {
  title: string
  description: string
  connected: boolean
  setupSteps?: string[]
  docsUrl?: string
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(!connected)

  return (
    <Card className={connected ? 'border-emerald-200' : 'border-amber-200'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot ok={connected} />
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant={connected ? 'success' : 'warning'}>
              {connected ? 'Connected' : 'Not configured'}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(e => !e)}>
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {!connected && setupSteps && (
            <Alert variant="info">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1">Setup steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </AlertDescription>
            </Alert>
          )}
          {children}
          {docsUrl && (
            <Button variant="link" size="sm" className="h-6 p-0 text-xs gap-1" asChild>
              <a href={docsUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />
                View documentation
              </a>
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export default function Settings() {
  const { user, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { connectedStore, setupStatus } = useApp()
  const { toast } = useToast()
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [notifications, setNotifications] = useState(user?.settings.notifications_enabled ?? true)
  const [defaultDraft, setDefaultDraft] = useState(user?.settings.default_listing_state === 'draft')
  const [autoOptimize, setAutoOptimize] = useState(user?.settings.auto_optimize ?? false)
  useEffect(() => {
    if (!user?.settings) return
    setNotifications(user.settings.notifications_enabled ?? true)
    setDefaultDraft(user.settings.default_listing_state === 'draft')
    setAutoOptimize(user.settings.auto_optimize ?? false)
  }, [user?.settings])
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const { openCheckout, checkoutElement } = useStripeCheckout()
  const { subscription, isActive, endingAt, refetch: refetchSub } = useSubscription()
  const checkoutStatus = searchParams.get('checkout')
  const checkoutSessionId = searchParams.get('session_id')

  useEffect(() => {
    if (checkoutStatus !== 'success' || !user?.id) return

    let cancelled = false
    let attempts = 0

    const pollPlanSync = async () => {
      if (checkoutSessionId) {
        await supabase.functions.invoke('sync-checkout-session', {
          body: { sessionId: checkoutSessionId, environment: getStripeEnvironment() },
        })
      }

      while (!cancelled && attempts < 10) {
        attempts += 1
        await Promise.all([refetchSub(), refreshProfile()])
        if (cancelled) return
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }

    void pollPlanSync()
    return () => { cancelled = true }
  }, [checkoutStatus, checkoutSessionId, user?.id, refetchSub, refreshProfile])

  async function handleOpenPortal() {
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/app/settings?tab=billing` },
      })
      if (error || !data?.url) throw new Error(error?.message || 'Portal unavailable')
      window.open(data.url, '_blank')
    } catch (e) {
      toast({ title: 'Portal unavailable', description: String(e), variant: 'destructive' })
    }
  }

  async function handleChangePlan(newPriceId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('change-subscription', {
        body: { newPriceId, environment: getStripeEnvironment() },
      })
      if (error || data?.error) throw new Error(error?.message || data?.error)
      toast({
        title: data.change === 'upgrade' ? 'Plan upgraded' : 'Downgrade scheduled',
        description: data.change === 'upgrade'
          ? 'You now have access to the new plan. A prorated charge was applied.'
          : 'You\'ll switch to the new plan at the end of your current billing period.',
        variant: 'success',
      })
      for (let i = 0; i < 6; i += 1) {
        await Promise.all([refetchSub(), refreshProfile()])
        await new Promise(resolve => setTimeout(resolve, 1200))
      }
    } catch (e) {
      toast({ title: 'Change failed', description: String(e), variant: 'destructive' })
    }
  }

  async function handleCancelOrResume(action: 'cancel' | 'resume') {
    try {
      const { data, error } = await supabase.functions.invoke('change-subscription', {
        body: { action, environment: getStripeEnvironment() },
      })
      if (error || data?.error) throw new Error(error?.message || data?.error)
      toast({
        title: action === 'cancel' ? 'Cancellation scheduled' : 'Subscription resumed',
        description: action === 'cancel'
          ? 'You\'ll keep access until the end of your current billing period.'
          : 'Your subscription will continue to renew normally.',
        variant: 'success',
      })
      await Promise.all([refetchSub(), refreshProfile()])
    } catch (e) {
      toast({ title: 'Action failed', description: String(e), variant: 'destructive' })
    }
  }

  const toggleKeyVisibility = (key: string) => setShowKey(prev => ({ ...prev, [key]: !prev[key] }))

  const copyEnvVar = (value: string) => {
    navigator.clipboard.writeText(value)
    toast({ title: 'Copied to clipboard' })
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Settings" description="Configure connections, preferences, and account" />

      <div className="flex-1 p-4 md:p-6">
        <Tabs value={searchParams.get('tab') || 'preferences'} onValueChange={(v) => { const sp = new URLSearchParams(searchParams); if (v === 'preferences') sp.delete('tab'); else sp.set('tab', v); setSearchParams(sp, { replace: true }); }}>
          <TabsList variant="line" className="mb-6 w-full">
            <TabsTrigger value="preferences" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5">
              <User className="h-3.5 w-3.5" />
              Account
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="connections" className="gap-1.5">
              <Share2 className="h-3.5 w-3.5" />
              Connections
            </TabsTrigger>
          </TabsList>

          {/* ─── Connections tab ─── */}
          <TabsContent value="connections" className="space-y-4">
            {/* System status */}
            <Card style={{ background: 'hsl(var(--surface-1))', borderColor: 'hsl(var(--border))' }}>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">System Status</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: 'Etsy', ok: setupStatus.etsy },
                    { label: 'Google Analytics', ok: setupStatus.googleAnalytics },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2 rounded-md p-2" style={{ background: 'hsl(var(--surface-2))', border: "1px solid hsl(var(--border))" }}>
                      <StatusDot ok={s.ok} />
                      <span className="text-xs">{s.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Etsy */}
            <ConnectionCard
              title="Etsy Store"
              description="Connect your Etsy shop to sync listings, track sales, and push optimizations."
              connected={!!connectedStore}
              setupSteps={[
                'Go to etsy.com/developers and click "Create a New App" — name it anything, like "My Store Insights"',
                'Etsy will give you a Keystring and a Shared Secret — copy both',
                'Click "Connect Etsy" below and paste them in when asked. Etsy will then ask you to approve access to your shop.',
              ]}
            >
              {connectedStore ? (
                <div className="flex items-center justify-between p-3 rounded-md" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                  <div>
                    <p className="font-medium text-sm">{connectedStore.shop_name}</p>
                    <p className="text-xs" style={{ color: "#64748b" }}>{connectedStore.listing_count} listings · Last synced recently</p>
                  </div>
                  <Button variant="outline" size="sm">Disconnect</Button>
                </div>
              ) : (
                <Button variant="etsy" className="gap-2 w-full" asChild>
                  <a href="/app/connect-etsy">
                    <Store className="h-4 w-4" />
                    Connect Etsy Store
                  </a>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Your Etsy keys stay locked on our server — they're never visible in your browser or to anyone else.
              </p>
            </ConnectionCard>

            {/* Google Analytics */}
            <ConnectionCard
              title="Google Analytics 4"
              description="Link your Google Analytics so we can show website traffic next to your Etsy performance."
              connected={setupStatus.googleAnalytics}
              setupSteps={[
                'Sign in to Google Analytics and open your store\'s property',
                'In the left menu, click Admin → Data Streams and copy the Measurement ID (it looks like G-XXXXXXXXXX)',
                'Back in Admin, click Property Settings and copy the Property ID (a long number)',
                'Paste both below and click Save — that\'s it. We handle the rest.',
              ]}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Measurement ID</Label>
                  <Input defaultValue={import.meta.env.VITE_GA_MEASUREMENT_ID ?? ''} className="font-mono text-xs" placeholder="G-XXXXXXXXXX" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Property ID</Label>
                  <Input defaultValue={import.meta.env.VITE_GA_PROPERTY_ID ?? ''} className="font-mono text-xs" placeholder="123456789" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                We only read your traffic numbers — we never change anything in your Google Analytics account.
              </p>
            </ConnectionCard>
          </TabsContent>


          {/* ─── Preferences tab ─── */}
          {/* ─── Billing tab ─── */}
          <TabsContent value="billing" className="space-y-4">
            {endingAt && (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your subscription is set to end on <strong>{endingAt.toLocaleDateString()}</strong>.
                  You'll keep access to your current plan until then.{' '}
                  <button onClick={handleOpenPortal} className="underline font-medium">
                    Resume in Stripe portal
                  </button>
                </AlertDescription>
              </Alert>
            )}

            {/* Fancy plan badge */}
            <div className="flex justify-start">
              <PlanBadge tier={(user?.tier as any) ?? 'free'} size="lg" />
            </div>

            {/* Current plan */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Current Plan</CardTitle>
                  <Badge variant={user?.tier === 'admin' ? 'admin' : user?.tier === 'agency' || user?.tier === 'pro' ? 'pro' : user?.tier === 'starter' ? 'info' : 'free'}>
                    {user?.tier ?? 'Free'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {user?.tier !== 'free' ? (
                  <div className="flex items-center justify-between rounded-md p-3" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <div>
                      <p className="text-sm font-medium text-emerald-900 capitalize">
                        {user?.tier} plan
                      </p>
                      <p className="text-xs text-emerald-700">
                        {subscription?.current_period_end
                          ? `${subscription.cancel_at_period_end ? 'Ends' : 'Renews'}: ${new Date(subscription.current_period_end).toLocaleDateString()}`
                          : 'Active'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {subscription?.cancel_at_period_end ? (
                        <Button variant="outline" size="sm" onClick={() => handleCancelOrResume('resume')}>
                          Resume
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleCancelOrResume('cancel')}>
                          Cancel
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={handleOpenPortal}>
                        Manage
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert variant="info">
                    <Zap className="h-4 w-4" />
                    <AlertDescription>
                      You're on the Free plan. Upgrade to unlock unlimited optimizations, automation, and analytics.
                    </AlertDescription>
                  </Alert>
                )}

                {subscription?.pending_tier && (
                  <Alert variant="info">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Scheduled change: you'll switch to the{' '}
                      <strong className="capitalize">{subscription.pending_tier}</strong> plan
                      {subscription.pending_change_at
                        ? <> on <strong>{new Date(subscription.pending_change_at).toLocaleDateString()}</strong></>
                        : ' at the end of your current billing cycle'}
                      . You'll keep your current plan until then.{' '}
                      <button onClick={handleOpenPortal} className="underline font-medium">
                        Cancel change
                      </button>
                    </AlertDescription>
                  </Alert>
                )}

                {!isPaymentsConfigured && (
                  <Alert variant="warning">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Payments are not configured yet.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Plan comparison */}
            <div className="flex items-center gap-3 mb-2">
              <p className="text-sm font-medium">Billing period</p>
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                {(['monthly', 'yearly'] as const).map(p => (
                  <button
                    key={p}
                    className={`rounded px-3 py-1 text-xs capitalize transition-colors ${billingPeriod === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setBillingPeriod(p)}
                  >
                    {p} {p === 'yearly' && <span className="text-[10px] ml-0.5 text-emerald-400">-20%</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid gap-4 sm:grid-cols-2 ${(SHOW_AGENCY_TIER || user?.tier === 'agency') ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
              {PLANS.filter(plan => SHOW_AGENCY_TIER || plan.id !== 'agency' || user?.tier === 'agency').map(plan => {
                const price = billingPeriod === 'yearly' ? plan.price_yearly : plan.price_monthly
                const planKey = plan.id as keyof typeof PLAN_PRICE_IDS
                const priceId = PLAN_PRICE_IDS[planKey]?.[billingPeriod]
                const isCurrent = user?.tier === plan.id
                const tierRank: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3 }
                const currentRank = tierRank[user?.tier ?? 'free'] ?? 0
                const planRank = tierRank[plan.id] ?? 0
                const isDowngrade = planRank < currentRank
                const actionLabel = isCurrent
                  ? 'Current plan'
                  : isDowngrade
                    ? `Downgrade to ${plan.name}`
                    : isActive
                      ? `Switch to ${plan.name}`
                      : `Upgrade to ${plan.name}`

                return (
                  <Card
                    key={plan.id}
                    interactive
                    variant={plan.highlighted ? 'highlight' : 'default'}
                    className={plan.highlighted ? 'shadow-md ring-1 ring-primary' : ''}
                  >
                    <CardContent className="p-5">
                      {plan.highlighted && <Badge className="mb-2">Most popular</Badge>}
                      <p className="text-lg font-bold">{plan.name}</p>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold">${price}</span>
                        <span className="text-xs text-muted-foreground">/mo{billingPeriod === 'yearly' ? ' billed annually' : ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>

                      {isCurrent ? (
                        <Button className="mt-4 w-full" variant="outline" disabled>Current plan</Button>
                      ) : plan.id === 'free' ? (
                        <Button
                          className="mt-4 w-full"
                          variant="outline"
                          disabled={upgradingPlan === plan.id || !isActive || !!subscription?.cancel_at_period_end}
                          onClick={async () => {
                            setUpgradingPlan(plan.id)
                            try {
                              await handleCancelOrResume('cancel')
                            } finally {
                              setUpgradingPlan(null)
                            }
                          }}
                        >
                          {upgradingPlan === plan.id
                            ? 'Working...'
                            : subscription?.cancel_at_period_end
                              ? 'Downgrade scheduled'
                              : isActive
                                ? 'Downgrade to Free'
                                : 'Free'}
                        </Button>
                      ) : (
                        <Button
                          className="mt-4 w-full"
                          variant={plan.highlighted ? 'default' : 'outline'}
                          disabled={upgradingPlan === plan.id || !isPaymentsConfigured}
                          onClick={async () => {
                            if (!priceId || !user) return
                            setUpgradingPlan(plan.id)
                            try {
                              if (isActive) {
                                await handleChangePlan(priceId)
                              } else {
                                openCheckout({
                                  priceId,
                                  customerEmail: user.email,
                                  userId: user.id,
                                })
                              }
                            } finally {
                              setUpgradingPlan(null)
                            }
                          }}
                        >
                          {upgradingPlan === plan.id ? 'Working...' : actionLabel}
                        </Button>
                      )}


                      <ul className="mt-4 space-y-1.5">
                        {plan.features.map(f => {
                          const isComingSoon = f.toLowerCase().includes('coming soon')
                          const isHighlight = f.includes('✨')
                          if (isHighlight) {
                            return (
                              <li key={f} className="flex items-center gap-2 text-xs font-semibold rounded-lg px-2.5 py-2"
                                style={{
                                  color: 'hsl(var(--primary))',
                                  background: 'linear-gradient(90deg, hsl(var(--primary) / 0.10), hsl(var(--primary) / 0.04))',
                                  border: '1px solid hsl(var(--primary) / 0.30)',
                                  boxShadow: '0 0 12px hsl(var(--primary) / 0.12)',
                                }}>
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                <span className="flex-1">{f.replace('✨ ', '')}</span>
                                <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold tracking-wider" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>FREE</Badge>
                              </li>
                            )
                          }
                          return (
                            <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                              {isComingSoon ? (
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center mt-0.5" style={{ borderColor: 'hsl(var(--primary) / 0.4)' }}>
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(var(--primary) / 0.6)' }} />
                                </span>
                              ) : (
                                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                              )}
                              <span className="flex-1">{isComingSoon ? f.replace(' (coming soon)', '') : f}</span>
                              {isComingSoon && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/8 font-normal">
                                  Soon
                                </Badge>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Agency early-access note for existing Agency subscribers */}
            {user?.tier === 'agency' && (
              <p className="text-center text-xs text-muted-foreground">
                Agency is currently in early access. Thank you for being an early supporter.
              </p>
            )}

            {/* Agency waitlist teaser for non-Agency users when the tier is hidden */}
            {!SHOW_AGENCY_TIER && user?.tier !== 'agency' && (
              <AgencyWaitlistTeaser variant="app" />
            )}


            {/* Usage */}
            {user?.tier === 'free' && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Usage</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">AI Optimizations</span>
                      <span className="font-medium">3 / 5 used</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'hsl(var(--surface-2))' }}>
                      <div className="h-full bg-primary rounded-full" style={{ width: '60%' }} />
                    </div>
                    <p className="text-xs text-muted-foreground">Resets on June 1. Upgrade for unlimited.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            {/* ── Appearance ── */}
            <AppearanceCard />
            {/* ── Third-party data sources (Section 10) ── */}
            <IntegrationsCard />
            <Card>
              <CardHeader><CardTitle className="text-base">Optimization Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Default listing state after upload</p>
                    <p className="text-xs text-muted-foreground">When uploading a new listing to Etsy</p>
                  </div>
                  <Select value={defaultDraft ? 'draft' : 'active'} onValueChange={v => setDefaultDraft(v === 'draft')}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-optimize</p>
                    <p className="text-xs text-muted-foreground">Automatically schedule listings below threshold grade</p>
                  </div>
                  <Switch checked={autoOptimize} onCheckedChange={setAutoOptimize} />
                </div>
                {autoOptimize && (
                  <div className="ml-4 space-y-3 pl-4 border-l">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Grade threshold</p>
                      <Select defaultValue="60">
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50/100</SelectItem>
                          <SelectItem value="60">60/100</SelectItem>
                          <SelectItem value="70">70/100</SelectItem>
                          <SelectItem value="80">80/100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Run schedule</p>
                      <Select defaultValue="nightly">
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immediately</SelectItem>
                          <SelectItem value="nightly">Nightly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">In-app notifications</p>
                    <p className="text-xs text-muted-foreground">Alerts when optimizations complete</p>
                  </div>
                  <Switch checked={notifications} onCheckedChange={setNotifications} />
                </div>
              </CardContent>
            </Card>

            <Button onClick={async () => {
              if (!user?.id) return
              const newSettings = {
                ...(user.settings ?? {}),
                default_listing_state: defaultDraft ? 'draft' : 'active',
                auto_optimize: autoOptimize,
                notifications_enabled: notifications,
              }
              const { error } = await supabase.from('user_profiles').update({ settings: newSettings }).eq('id', user.id)
              if (error) {
                toast({ title: 'Failed to save', description: error.message, variant: 'destructive' })
                return
              }
              await refreshProfile()
              toast({ title: 'Settings saved', variant: 'success' })
            }}>
              Save preferences
            </Button>

            <SanityCheckSettings />
          </TabsContent>

          {/* ─── Account tab ─── */}
          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ProfileForm />
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">Plan:</p>
                  <Badge variant={user?.tier === 'admin' ? 'admin' : user?.tier === 'pro' ? 'pro' : 'free'}>
                    {user?.tier ?? 'free'}
                  </Badge>
                  {user?.tier === 'free' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSearchParams({ tab: 'billing' }, { replace: true })}
                    >
                      Upgrade to Pro
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <LinkedAccountsCard />

            <InviteCodeCard />

            <Card className="border-red-200">

              <CardHeader>
                <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete account</p>
                    <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete account</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {checkoutElement}
    </div>
  )
}

