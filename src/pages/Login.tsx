import { useState, useEffect } from 'react'
import { PageSeo } from '@/components/seo/PageSeo'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
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

const oauthRedirectUri = () => `${window.location.origin}/auth/callback`


const schema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

const TRUST_PILLS = [
  { icon: '🔒', text: 'Your Etsy data is never sold or shared' },
  { icon: '✦', text: 'Nothing changes in your shop without your approval' },
  { icon: '🇺🇸', text: 'Built by a service-disabled veteran' },
]

const inputStyle = {
  background: "hsl(var(--surface-1))",
  borderColor: "hsl(var(--border))",
  color: 'hsl(var(--foreground))',
}

const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    }),
  ])
}

export default function Login() {
  const { login, isAuthenticated, isLoading, syncAuthSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/app/dashboard'

  // Decide post-login destination from the actual admin role, not a hardcoded email.
  const resolveDestination = async (fallback: string): Promise<string> => {
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) return fallback
      const { data: { user: authUser } } = await withTimeout(supabase.auth.getUser(), 5000, 'auth user check')
      if (!authUser) return fallback
      const { data: roles } = await withTimeout(
        supabase.from('user_roles').select('role').eq('user_id', authUser.id),
        5000,
        'admin role check'
      )
      const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin')
      return isAdmin ? '/app/admin' : fallback
    } catch {
      return fallback
    }
  }

  // Forward already-authenticated users (e.g. returning from Google OAuth) into the app
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void resolveDestination(from).then(dest => navigate(dest, { replace: true }))
    }
  }, [isAuthenticated, isLoading, from, navigate])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })


  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      const result = await withTimeout(login(data.username, data.password), 15000, 'sign in')
      if (result.error) { setError(result.error); return }
      const dest = await resolveDestination(from)
      navigate(dest, { replace: true })
    } catch {
      setError('Sign in is taking too long. Please refresh and try again.')
    }
  }

  return (
    <>
    <PageSeo title="Sign in — RadarIQ" description="Sign in to RadarIQ to grade and optimize your Etsy listings with AI-powered insights." path="/login" />
    <div className="flex min-h-screen" style={{ background: "hsl(var(--background))", fontFamily: "'Inter', sans-serif" }}>
      {/* ── Left panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative overflow-hidden p-12" style={{ background: "hsl(var(--surface-1))" }}>
        <RadarIcon size={32} animated />

        {/* Radar + stats */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-10">
          {/* Radar */}
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
              Your shop. Your data. Your control.
            </h2>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              RadarIQ connects to your Etsy shop through official OAuth — we only ever touch what you authorize.
            </p>
          </div>

          {/* Trust pills */}
          <div className="flex flex-col gap-2.5 w-full max-w-xs">
            {TRUST_PILLS.map(p => (
              <div
                key={p.text}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                style={{ background: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.18)' }}
              >
                <span className="text-base leading-none shrink-0">{p.icon}</span>
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 flex-col px-8 py-8 md:px-12" style={{ background: "hsl(var(--background))" }}>
        {/* Back to home — top of right panel */}
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
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>Welcome back</h1>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Sign in to your Radar IQ account</p>
          </div>

          {/* Google (disabled) */}
          <button
            type="button"
            onClick={async () => {
              setError('')
              const result = await lovable.auth.signInWithOAuth('google', {
                redirect_uri: oauthRedirectUri(),
                extraParams: { prompt: 'select_account' },
              })
              if (result.error) setError(result.error.message || 'Google sign-in failed')
              if (result.redirected) return
              if (!result.redirected && !result.error) {
                const hasSession = await syncAuthSession()
                if (hasSession) navigate(await nextRouteAfterAuth(), { replace: true })
                else setError('Google sign-in completed, but the session could not be restored. Please try again.')
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
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Username or email</Label>
              <Input placeholder="you@example.com" autoComplete="username" {...register('username')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
              {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Password</Label>
              <div className="relative">
                <Input type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" {...register('password')} style={inputStyle} className="h-10 text-sm placeholder:text-muted-foreground/40" />
                <button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} onClick={() => setShowPass(s => !s)}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl font-bold text-foreground transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: "hsl(var(--primary))", boxShadow: '0 8px 24px hsl(var(--primary) / 0.3)' }}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Don't have an account yet?{' '}
            <Link to="/register" className="font-medium" style={{ color: 'hsl(var(--primary))' }}>
              Create one
            </Link>
          </p>

        </div>{/* max-w-sm flex-1 */}
      </div>{/* right panel */}
    </div>
    </>
  )
}
