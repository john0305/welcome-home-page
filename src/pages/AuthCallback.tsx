import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

async function nextRouteAfterAuth(): Promise<string> {
  if (!supabase) return '/app/dashboard'
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return '/login'

  // If the auth user has no username in their metadata (e.g. Google sign-up),
  // make them finish their profile before entering the app.
  const hasUsernameMeta = !!(user.user_metadata?.username as string | undefined)
  if (hasUsernameMeta) return '/app/dashboard'

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle()

  const completed = !!(profile?.settings as Record<string, unknown> | null)?.profile_completed
  return completed ? '/app/dashboard' : '/complete-profile'
}

export default function AuthCallback() {
  const { isAuthenticated, isLoading, syncAuthSession } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return

    const go = async () => {
      if (!isAuthenticated) {
        const hasSession = await syncAuthSession()
        if (!hasSession) {
          navigate('/login', { replace: true })
          return
        }
      }
      const route = await nextRouteAfterAuth()
      navigate(route, { replace: true })
    }
    void go()
  }, [isAuthenticated, isLoading, navigate, syncAuthSession])

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Finishing sign in...</p>
      </div>
    </div>
  )
}

export { nextRouteAfterAuth }
