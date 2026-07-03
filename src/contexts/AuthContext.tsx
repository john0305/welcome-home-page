import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { UserProfile, UserSettings } from '@/types'
import { isSupabaseConfigured, supabase, signIn as supabaseSignIn, signOut as supabaseSignOut } from '@/lib/supabase'

interface AuthContextValue {
  user: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  usingMockAuth: boolean
  login: (usernameOrEmail: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  register: (email: string, password: string, username: string, fullName: string, inviteCode?: string) => Promise<{ error?: string }>
  refreshProfile: () => Promise<void>
  syncAuthSession: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const MOCK_USERS: Array<{ username: string; email: string; password: string; profile: UserProfile }> = []

const SESSION_KEY = 'radariq_session'

const DEFAULT_USER_SETTINGS: UserSettings = {
  default_listing_state: 'draft',
  optimization_schedule: 'nightly',
  notifications_enabled: true,
  gemini_model: 'gemini-1.5-flash',
  auto_optimize: false,
  auto_optimize_threshold: 60,
  auto_optimize_interval_days: 90,
  low_activity_threshold_days: 30,
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])

function profileFromAuthUser(authUser: SupabaseUser): UserProfile {
  const email = authUser.email ?? ''

  return normalizeProfile({
    id: authUser.id,
    email,
    username:
      (authUser.user_metadata?.username as string | undefined) ??
      (email ? email.split('@')[0] : `user_${authUser.id.slice(0, 8)}`),
    full_name:
      (authUser.user_metadata?.full_name as string | undefined) ??
      (authUser.user_metadata?.name as string | undefined) ??
      '',
    avatar_url: authUser.user_metadata?.avatar_url as string | undefined,
    tier: 'free',
    created_at: authUser.created_at,
    updated_at: new Date().toISOString(),
    settings: DEFAULT_USER_SETTINGS,
  })
}

function getOAuthTokensFromUrl() {
  if (typeof window === 'undefined') return null

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  const accessToken = hashParams.get('access_token') ?? searchParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') ?? searchParams.get('refresh_token')

  if (!accessToken || !refreshToken) return null
  return { access_token: accessToken, refresh_token: refreshToken }
}

function clearOAuthTokensFromUrl() {
  if (typeof window === 'undefined') return
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search.replace(/[?&](access_token|refresh_token)=[^&]*/g, '')}`)
}

function normalizeProfile(profile: Record<string, unknown>): UserProfile {
  const settings = typeof profile.settings === 'object' && profile.settings !== null && !Array.isArray(profile.settings)
    ? profile.settings
    : {}

  return {
    ...profile,
    id: String(profile.id),
    email: typeof profile.email === 'string' ? profile.email : '',
    username: typeof profile.username === 'string' ? profile.username : '',
    full_name: typeof profile.full_name === 'string' ? profile.full_name : '',
    avatar_url: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined,
    tier: ['free', 'starter', 'pro', 'agency', 'admin'].includes(String(profile.tier))
      ? profile.tier as UserProfile['tier']
      : 'free',
    created_at: typeof profile.created_at === 'string' ? profile.created_at : new Date().toISOString(),
    updated_at: typeof profile.updated_at === 'string' ? profile.updated_at : new Date().toISOString(),
    settings: { ...DEFAULT_USER_SETTINGS, ...settings } as UserSettings,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const usingMockAuth = !isSupabaseConfigured

  const buildProfileFromAuthUser = (authUser: SupabaseUser) => ({
    id: authUser.id,
    email: authUser.email ?? null,
    username:
      (authUser.user_metadata?.username as string | undefined) ??
      (authUser.email ? authUser.email.split('@')[0] : `user_${authUser.id.slice(0, 8)}`),
    full_name:
      (authUser.user_metadata?.full_name as string | undefined) ??
      (authUser.user_metadata?.name as string | undefined) ??
      '',
  })

  useEffect(() => {
    if (usingMockAuth) {
      // Restore mock session from localStorage
      const stored = localStorage.getItem(SESSION_KEY)
      if (stored) {
        try {
          const profile = JSON.parse(stored) as UserProfile
          setUser(profile)
        } catch {
          localStorage.removeItem(SESSION_KEY)
        }
      }
      setIsLoading(false)
      return
    }

    let mounted = true
    let authEventVersion = 0

    // Hard safety: never let the app sit on "Loading Radar IQ..." forever.
    // If session restore hasn't resolved in 6s, drop the loading screen so
    // the user sees either the login page or a best-effort authed UI.
    const loadingSafety = setTimeout(() => {
      if (mounted) setIsLoading(false)
    }, 6000)

    const restoreSession = async () => {
      const urlTokens = getOAuthTokensFromUrl()
      const result = urlTokens
        ? await withTimeout(supabase!.auth.setSession(urlTokens), 5000, 'auth.setSession')
        : await withTimeout(supabase!.auth.getSession(), 5000, 'auth.getSession')
      const session = result.data.session
      const error = result.error


      if (error) throw error
      if (urlTokens && session?.user) clearOAuthTokensFromUrl()
      if (!mounted) return

      if (session?.user) {
        await fetchProfile(session.user.id, session.user)
      } else {
        setUser(null)
        setIsLoading(false)
      }
    }

    void restoreSession().catch((error) => {
      console.error('Failed to restore auth session', error)
      if (mounted) setIsLoading(false)
    })


    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      // Ignore noisy events that don't change auth identity. These fire often
      // (tab focus, periodic refresh) and were causing the whole app to flash
      // the dark "Loading…" screen because ProtectedRoute unmounts on isLoading.
      // Do not bump authEventVersion for ignored events — a TOKEN_REFRESHED event
      // can arrive right after SIGNED_IN and otherwise cancel the queued profile load,
      // leaving isLoading stuck true.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        return
      }

      authEventVersion += 1
      const eventVersion = authEventVersion

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsLoading(false)
        return
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Never put the whole app into a blocking loading state here. Password
        // login handles the foreground profile load; OAuth/restored sessions can
        // safely render an auth-user fallback while the profile hydrates.
        setUser((prev) => prev?.id === session.user.id ? prev : profileFromAuthUser(session.user))
        setIsLoading(false)
        setTimeout(() => {
          if (mounted && eventVersion === authEventVersion) {
            void fetchProfile(session.user.id, session.user, { background: true })
          }
        }, 0)
      }
    })

    return () => {
      mounted = false
      clearTimeout(loadingSafety)
      subscription.unsubscribe()
    }

  }, [usingMockAuth])


  const fetchProfile = async (userId: string, sessionUser?: SupabaseUser, opts?: { background?: boolean }) => {
    const background = !!opts?.background

    if (!supabase) {
      if (!background) setIsLoading(false)
      return false
    }

    // Hard timeout so a stalled Postgrest request can never freeze the auth UI.
    const timeout = <T,>(p: PromiseLike<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        Promise.resolve(p),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ])

    try {
      const authUser = sessionUser ?? (await supabase.auth.getUser()).data.user

      let { data, error } = await timeout(
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        8000,
        'user_profiles fetch'
      )

      if (error) throw error

      // Self-heal: if a profile row is missing (e.g. account predates the trigger),
      // create one on the fly so the user isn't stranded on the login screen.
      if (!data && authUser) {
        const { data: inserted, error: insertError } = await timeout(
          supabase
            .from('user_profiles')
            .insert(buildProfileFromAuthUser(authUser))
            .select('*')
            .single(),
          8000,
          'user_profiles insert'
        )

        if (insertError) throw insertError
        data = inserted
      }

      if (data) {
        let profile = normalizeProfile(data)
        // user_roles is the authoritative source for platform-admin status.
        // Always merge it — even when user_profiles loaded successfully —
        // so the router sees the correct tier before setIsLoading(false) fires.
        if (profile.tier !== 'admin') {
          try {
            const { data: roleRows } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', userId)
            const roles = ((roleRows ?? []) as Array<{ role: string }>).map(r => r.role)
            if (roles.includes('admin')) {
              profile = { ...profile, tier: 'admin' }
            }
          } catch {
            // Non-fatal — if user_roles is unavailable, keep the profile tier as-is.
          }
        }
        setUser(profile)
        // Fire-and-forget: refresh Etsy token if it's expiring soon. No-op if no token saved.
        if (!background) {
          void supabase.functions.invoke('etsy-refresh-token', { body: {} })
            .catch((e) => console.debug('etsy-refresh-token skipped', e))
        }
        return true
      }

      // Background refresh must NEVER sign the user out due to a transient miss.
      if (background) return false
      // Fall back to the auth-user identity so login isn't blocked.
      if (sessionUser) {
        setUser(profileFromAuthUser(sessionUser))
        void applyRoleFallback(sessionUser.id)
        retryProfileLater(sessionUser.id, sessionUser)
        return true
      }
      setUser(null)
      return false
    } catch (error) {
      console.error('Failed to load authenticated profile', error)
      // Background refresh must NEVER clobber or sign out on transient errors.
      if (background) return false
      // Don't downgrade an already-loaded profile to the auth-user fallback
      // (which is hard-coded tier:'free') just because of a transient 403
      // from an expired JWT — Supabase will refresh and the next fetch will
      // restore the real row.
      let kept = false
      setUser((prev) => {
        if (prev) { kept = true; return prev }
        return sessionUser ? profileFromAuthUser(sessionUser) : null
      })
      if (!kept && sessionUser) {
        void applyRoleFallback(sessionUser.id)
        retryProfileLater(sessionUser.id, sessionUser)
      }
      return kept || !!sessionUser
    } finally {
      if (!background) setIsLoading(false)
    }
  }

  // When the full profile fetch times out, patch in the admin tier from
  // user_roles so the admin UI renders correctly instead of looking like a free user.
  const applyRoleFallback = async (userId: string) => {
    if (!supabase) return
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
      const roles = (data ?? []).map((r: { role: string }) => r.role as string)
      if (roles.includes('admin')) {
        setUser((prev) => (prev && prev.id === userId ? { ...prev, tier: 'admin' } : prev))
      }
    } catch (e) {
      console.debug('role fallback skipped', e)
    }
  }

  // Retry the full profile fetch a few times so the real row (with tier,
  // settings, etc.) replaces the fallback once Postgrest recovers.
  const retryProfileLater = (userId: string, sessionUser: SupabaseUser) => {
    let attempts = 0
    const tick = async () => {
      attempts += 1
      const ok = await fetchProfile(userId, sessionUser, { background: true })
      if (!ok && attempts < 4) setTimeout(tick, 2000 * attempts)
    }
    setTimeout(tick, 1500)
  }

  // Background profile refresh so tier/badge updates after checkout are picked up.
  // Crucially this does NOT clear the user on transient failures.
  // Debounced: focus/visibility events won't trigger more than once per 30s.
  useEffect(() => {
    if (usingMockAuth || !user?.id) return

    let lastRefreshMs = 0
    const MIN_REFRESH_INTERVAL = 30_000

    const refreshCurrentProfile = () => {
      const now = Date.now()
      if (now - lastRefreshMs < MIN_REFRESH_INTERVAL) return
      lastRefreshMs = now
      void fetchProfile(user.id, undefined, { background: true })
    }

    const interval = window.setInterval(refreshCurrentProfile, 30000)

    const handleVisible = () => {
      if (document.visibilityState === 'visible') refreshCurrentProfile()
    }

    window.addEventListener('focus', refreshCurrentProfile)
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshCurrentProfile)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [usingMockAuth, user?.id])

  // Heartbeat: ping last_seen_at every 60s so the admin can see who's active now.
  // Debounced: focus/visibility events won't write more than once per 2 minutes.
  useEffect(() => {
    if (usingMockAuth || !user?.id || !supabase) return

    let lastPingMs = 0
    const MIN_PING_INTERVAL = 120_000

    const ping = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastPingMs < MIN_PING_INTERVAL) return
      lastPingMs = now
      void supabase!
        .from('user_profiles')
        .update({ last_seen_at: new Date().toISOString() } as never)
        .eq('id', user.id)
        .then(() => {}, () => {})
    }

    ping()
    const interval = window.setInterval(ping, 60000)
    document.addEventListener('visibilitychange', ping)
    window.addEventListener('focus', ping)

    // Once per session: bump this UTC hour in the login-hour histogram that
    // predictive-refresh uses to pre-warm insights before the user's usual
    // login window (Section 6). Read-modify-write is fine at one session at
    // a time per user.
    void (async () => {
      try {
        // activity_hours lands in generated types with migration
        // 20260702000006; untyped-client pattern until then.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any
        const { data } = await db
          .from('user_profiles')
          .select('activity_hours')
          .eq('id', user.id)
          .maybeSingle()
        const hours: Record<string, number> = { ...(data?.activity_hours ?? {}) }
        const h = String(new Date().getUTCHours())
        hours[h] = (hours[h] ?? 0) + 1
        await db
          .from('user_profiles')
          .update({ activity_hours: hours })
          .eq('id', user.id)
      } catch { /* histogram is best-effort */ }
    })()

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', ping)
      window.removeEventListener('focus', ping)
    }
  }, [usingMockAuth, user?.id])




  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    if (usingMockAuth) {
      const match = MOCK_USERS.find(
        u => (u.username === usernameOrEmail || u.email === usernameOrEmail) && u.password === password
      )
      if (!match) return { error: 'Invalid username or password' }
      setUser(match.profile)
      localStorage.setItem(SESSION_KEY, JSON.stringify(match.profile))
      return {}
    }

    setIsLoading(true)
    const email = usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@radariq.app`
    let signInResult: Awaited<ReturnType<typeof supabaseSignIn>>
    try {
      signInResult = await withTimeout(supabaseSignIn(email, password), 15000, 'sign in')
    } catch (error) {
      console.error('Sign in failed or timed out', error)
      setIsLoading(false)
      return { error: 'Sign in is taking too long. Please refresh and try again.' }
    }
    const { data, error } = signInResult
    if (error) {
      setIsLoading(false)
      return { error: error.message }
    }

    const authUser = data.user ?? data.session?.user
    if (!authUser) {
      setIsLoading(false)
      return { error: 'Signed in, but the session could not be restored. Please try again.' }
    }

    // Establish the authenticated UI immediately. Full profile/role hydration is
    // best-effort in the background so a slow profile query cannot keep the
    // login button or protected-route loading screen stuck.
    setUser(profileFromAuthUser(authUser))
    setIsLoading(false)
    void applyRoleFallback(authUser.id)
    void fetchProfile(authUser.id, authUser, { background: true })

    return {}
  }, [usingMockAuth])

  const logout = useCallback(async () => {
    if (usingMockAuth) {
      setUser(null)
      localStorage.removeItem(SESSION_KEY)
      return
    }
    // Clear local user immediately so the UI updates even if signOut stalls.
    setUser(null)
    try {
      await Promise.race([
        supabaseSignOut(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    } catch (e) {
      console.warn('supabase signOut failed/timed out', e)
    }
    try {
      // Best-effort: clear any persisted supabase session in storage.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.includes('supabase.auth'))
        .forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
  }, [usingMockAuth])

  const register = useCallback(async (email: string, password: string, username: string, fullName: string, inviteCode?: string) => {
    if (usingMockAuth) {
      const newUser: UserProfile = {
        id: `user-${Date.now()}`,
        email,
        username,
        full_name: fullName,
        tier: 'free',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        settings: {
          default_listing_state: 'draft',
          optimization_schedule: 'nightly',
          notifications_enabled: true,
          gemini_model: 'gemini-1.5-flash',
          auto_optimize: false,
          auto_optimize_threshold: 60,
          auto_optimize_interval_days: 90,
          low_activity_threshold_days: 30,
        },
      }
      setUser(newUser)
      localStorage.setItem(SESSION_KEY, JSON.stringify(newUser))
      return {}
    }

    const { data: setting } = await supabase!.from('system_settings').select('value').eq('key', 'signups_enabled').maybeSingle()
    const signupsEnabled = setting?.value === true || setting?.value === 'true' || setting == null
    if (!signupsEnabled) return { error: 'New signups are currently disabled. Please check back soon.' }

    let preferredTheme: string | null = null
    try { preferredTheme = localStorage.getItem('radariq_theme') } catch { /* ignore */ }

    const { error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { username, full_name: fullName, invite_code: inviteCode ?? null, preferred_theme: preferredTheme } },
    })
    if (!error) {
      // Best-effort persist to the user profile (RLS allows the user to update their own row)
      try {
        const { data: { user: created } } = await supabase!.auth.getUser()
        if (created?.id && preferredTheme) {
          await supabase!.from('user_profiles').update({ preferred_theme: preferredTheme } as any).eq('id', created.id)
        }
      } catch { /* non-fatal */ }
    }
    if (error) return { error: error.message }
    return {}
  }, [usingMockAuth])

  const refreshProfile = useCallback(async () => {
    if (!user?.id || usingMockAuth) return
    await fetchProfile(user.id)
  }, [user?.id, usingMockAuth])

  const syncAuthSession = useCallback(async () => {
    if (usingMockAuth || !supabase) return !!user
    try {
      setIsLoading(true)
      const urlTokens = getOAuthTokensFromUrl()
      const { data: { session }, error } = urlTokens
        ? await supabase.auth.setSession(urlTokens)
        : await supabase.auth.getSession()

      if (error) throw error
      if (urlTokens && session?.user) clearOAuthTokensFromUrl()
      if (!session?.user) {
        setUser(null)
        setIsLoading(false)
        return false
      }

      return await fetchProfile(session.user.id, session.user)
    } catch (error) {
      console.error('Failed to sync auth session', error)
      setUser(null)
      setIsLoading(false)
      return false
    }
  }, [usingMockAuth, user])

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user, usingMockAuth,
      login, logout, register, refreshProfile, syncAuthSession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
