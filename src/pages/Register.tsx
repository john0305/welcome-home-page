import { useEffect, useState } from 'react'
import { PageSeo } from '@/components/seo/PageSeo'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, Sparkles } from 'lucide-react'
import { WaitlistCard } from '@/components/landing/WaitlistCard'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadarIcon } from '@/components/layout/Logo'
import { useAuth } from '@/contexts/AuthContext'
import { lovable } from '@/integrations/lovable'
import { nextRouteAfterAuth } from '@/pages/AuthCallback'
import { supabase } from '@/lib/supabase'
import { supabase as supabaseClient } from '@/integrations/supabase/client'
import BetaSignupForm from '@/components/beta/BetaSignupForm'


async function notifyAdminOfSignup(payload: {
  email: string
  fullName?: string
  username?: string
  provider: 'email' | 'google'
  inviteCode?: string | null
}) {
  if (!supabase) return
  try {
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'new-user-signup-admin',
        idempotencyKey: `signup-admin-${payload.provider}-${payload.email}`,
        templateData: {
          email: payload.email,
          fullName: payload.fullName,
          username: payload.username,
          provider: payload.provider,
          inviteCode: payload.inviteCode ?? null,
          signedUpAt: new Date().toISOString(),
        },
      },
    })
  } catch (err) {
    console.warn('admin signup notification failed', err)
  }
}

async function sendWelcomeEmail(email: string, fullName?: string) {
  if (!supabase) return
  const firstName = fullName?.split(' ')[0]?.trim() || undefined
  try {
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'welcome',
        recipientEmail: email,
        idempotencyKey: `welcome-${email}`,
        templateData: { firstName, email },
      },
    })
  } catch (err) {
    console.warn('welcome email failed', err)
  }
}

const oauthRedirectUri = () => `${window.location.origin}/auth/callback`

const schema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be under 30 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteCode: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const inputStyle = {
  background: "hsl(var(--surface-1))",
  borderColor: "hsl(var(--border))",
  color: '#f8fafc',
}

export default function Register() {
  const { register: authRegister, syncAuthSession } = useAuth()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [signupsEnabled, setSignupsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabaseClient
        .from('system_settings')
        .select('value')
        .eq('key', 'signups_enabled')
        .maybeSingle()
      if (cancelled) return
      const v = data?.value
      setSignupsEnabled(v === true || v === 'true' || data == null)
    })()
    return () => { cancelled = true }
  }, [])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', username: '', email: '', password: '', inviteCode: '' },
  })


  const onSubmit = async (data: FormData) => {
    setError('')
    const result = await authRegister(data.email, data.password, data.username, data.fullName, data.inviteCode)
    if (result.error) setError(result.error)
    else {
      void notifyAdminOfSignup({
        email: data.email,
        fullName: data.fullName,
        username: data.username,
        provider: 'email',
        inviteCode: data.inviteCode || null,
      })
      void sendWelcomeEmail(data.email, data.fullName)
      setSuccess(true)
    }
  }

  if (signupsEnabled === false) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: '#060D1F', fontFamily: "'Inter', sans-serif" }}
      >
        <div
          className="w-full max-w-md rounded-2xl border p-7 md:p-8"
          style={{
            background: '#0D1929',
            borderColor: 'hsl(var(--border))',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          <div className="flex flex-col items-center text-center mb-6">
            <RadarIcon size={40} animated />
            <p
              className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-2"
              style={{ color: '#00C4AF' }}
            >
              Join the Beta Waitlist
            </p>
            <h1
              className="text-2xl font-extrabold text-foreground leading-snug"
              style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}
            >
              RadarIQ is in active beta.
            </h1>
            <p className="text-sm mt-2" style={{ color: '#94A3B8' }}>
              Join the waitlist and we'll reach out the moment your spot opens — founding members get priority access and a permanent discount.
            </p>
          </div>

          <WaitlistCard />

          <div className="mt-6 pt-5 border-t flex flex-col items-center gap-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to radariq.app
            </Link>
            <p style={{ color: 'hsl(var(--muted-foreground))' }}>
              Already have an account?{' '}
              <Link to="/login" className="font-medium" style={{ color: '#00C4AF' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (success) {

    return (
      <div className="flex min-h-screen items-center justify-center px-6" style={{ background: "hsl(var(--background))", fontFamily: "'Inter', sans-serif" }}>
        <div className="absolute top-6 left-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to radariq.app
          </Link>
        </div>

        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-6">
            <RadarIcon size={40} animated />
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6 text-xs font-semibold"
            style={{
              background: 'hsl(var(--primary) / 0.1)',
              border: '1px solid hsl(var(--primary) / 0.25)',
              color: 'hsl(var(--primary))',
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Account created
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Check your email
          </h1>
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
            We sent a confirmation link to your email address. Click it to activate your account, then sign in.
          </p>

          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full h-11 rounded-xl font-bold text-foreground text-sm transition-all active:scale-[0.98]"
            style={{
              background: "hsl(var(--primary))",
              boxShadow: '0 8px 24px hsl(var(--primary) / 0.3)',
            }}
          >
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
    <PageSeo title="Create account — RadarIQ" description="Create your RadarIQ account to start grading and optimizing your Etsy listings with AI." path="/register" />
    <div className="flex min-h-screen" style={{ background: "hsl(var(--background))", fontFamily: "'Inter', sans-serif" }}>
      {/* ── Left panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative overflow-hidden p-12" style={{ background: "hsl(var(--surface-1))" }}>
        <RadarIcon size={32} animated />

        <div className="flex-1 flex flex-col items-center justify-center space-y-10">
          <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
            {[1, 0.7, 0.44].map((scale, i) => (
              <div key={i} className="absolute rounded-full border" style={{
                width: 280 * scale, height: 280 * scale,
                borderColor: `hsl(163 60% 26% / ${0.08 + i * 0.05})`,
              }} />
            ))}
            <div className="radar-sweep-bg absolute rounded-full" style={{ width: '100%', height: '100%' }} />
            {[
              { top: '22%', left: '60%', delay: '0s' },
              { top: '58%', left: '25%', delay: '1s' },
              { top: '38%', left: '75%', delay: '1.7s' },
            ].map((b, i) => (
              <div key={i} className="radar-blip absolute" style={{ top: b.top, left: b.left, animationDelay: b.delay }} />
            ))}
            <div className="relative z-10 h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.3)' }}>
              <div className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
            </div>
          </div>

          <div className="text-center max-w-xs space-y-2">
            <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              Make your own listings work harder
            </h2>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              RADAR IQ helps Etsy sellers grade and optimize their own shop's listings — authorized via your Etsy account.
            </p>
          </div>
        </div>

        <blockquote className="text-sm italic max-w-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          "My favorites tripled in two months. Radar IQ found keywords I never would have thought of."
          <footer className="mt-2 not-italic font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>— Maya K., MoonlitCrafts</footer>
        </blockquote>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 flex-col px-8 py-8 md:px-12" style={{ background: "hsl(var(--background))" }}>
        <div className="mb-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to radariq.app
          </Link>
        </div>

        <div className="mx-auto w-full max-w-sm flex flex-col justify-center flex-1 py-8">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <RadarIcon size={28} animated />
            <span className="font-extrabold text-lg text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              RADAR <span style={{ color: 'hsl(var(--primary))' }}>IQ</span>
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>Create your account</h1>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Start optimizing your Etsy listings</p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={async () => {
              setError('')
              const result = await lovable.auth.signInWithOAuth('google', {
                redirect_uri: oauthRedirectUri(),
                extraParams: { prompt: 'select_account' },
              })
              if (result.error) setError(result.error.message || 'Google sign-up failed')
              if (result.redirected) return
              if (!result.redirected && !result.error) {
                const hasSession = await syncAuthSession()
                if (hasSession) navigate(await nextRouteAfterAuth(), { replace: true })
                else setError('Google sign-up completed, but the session could not be restored. Please try again.')
              }
            }}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition-colors hover:bg-accent"
            style={{ borderColor: "hsl(var(--border))", color: 'hsl(var(--muted-foreground))', background: "hsl(var(--surface-1))" }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "hsl(var(--surface-1))" }} />
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>or</span>
            <div className="flex-1 h-px" style={{ background: "hsl(var(--surface-1))" }} />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Full name</Label>
              <Input placeholder="Maya K." autoComplete="name" {...register('fullName')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
              {errors.fullName && <p className="text-xs text-red-400">{errors.fullName.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Username</Label>
              <Input placeholder="moonlit_crafts" autoComplete="username" {...register('username')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
              {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Email</Label>
              <Input type="email" placeholder="you@example.com" autoComplete="email" {...register('email')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Password</Label>
              <div className="relative">
                <Input type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" {...register('password')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
                <button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} onClick={() => setShowPass(s => !s)}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Invite code (optional)</Label>
              <Input placeholder="EARLY2027" autoComplete="off" {...register('inviteCode')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
              {errors.inviteCode && <p className="text-xs text-red-400">{errors.inviteCode.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl font-bold text-foreground transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: "hsl(var(--primary))", boxShadow: '0 8px 24px hsl(var(--primary) / 0.3)' }}
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-medium" style={{ color: 'hsl(var(--primary))' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
    </>
  )
}
