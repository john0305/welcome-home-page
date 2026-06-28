import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Achievement {
  id: string
  name: string
  description: string
  flavor_text: string | null
  icon: string
  category: string
  points: number
}
interface UserAch {
  achievement_id: string
  awarded_at: string
  is_valid: boolean
  hidden_from_user?: boolean
  trigger_snapshot: Record<string, unknown>
}

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'getting_started', label: 'Getting Started' },
  { id: 'sales', label: 'Sales' },
  { id: 'listings', label: 'Listings' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'echo', label: 'Echo' },
  { id: 'renewal_health', label: 'Renewal Health' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'loyalty', label: 'Loyalty' },
]

const LOCKED_HINTS: Record<string, string> = {
  getting_started: 'Keep exploring RadarIQ to unlock this.',
  sales: 'Keep selling — your store will get you there.',
  listings: 'Keep growing and refreshing your listings.',
  optimization: 'Keep optimizing your listings to unlock this.',
  echo: 'Keep working with Echo to unlock this.',
  renewal_health: 'Stay on top of your renewal health.',
  pinterest: 'Promote your listings via Pinterest Spotlight.',
  loyalty: 'Stick with us — this one rewards consistency.',
}

export default function Achievements() {
  const { user } = useAuth()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [earned, setEarned] = useState<UserAch[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      try { await supabase.functions.invoke('check-and-award-achievements', { body: {} }) } catch { /* non-fatal */ }
      let { data, error } = await supabase.functions.invoke('get-user-achievements', { body: {} })
      if (error && !cancelled) {
        console.warn('Achievements load failed, refreshing session and retrying', error)
        try { await supabase.auth.refreshSession() } catch { /* ignore */ }
        try { await supabase.functions.invoke('check-and-award-achievements', { body: {} }) } catch { /* non-fatal */ }
        const retry = await supabase.functions.invoke('get-user-achievements', { body: {} })
        data = retry.data
        error = retry.error
      }
      if (cancelled) return
      if (error) console.error('achievements load error', error)
      const payload = (data ?? {}) as { achievements?: Achievement[]; earned?: UserAch[] }
      setAchievements(payload.achievements ?? [])
      setEarned(payload.earned ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const earnedMap = useMemo(() => {
    const m = new Map<string, UserAch>()
    for (const e of earned) m.set(e.achievement_id, e)
    return m
  }, [earned])

  const totalPoints = useMemo(
    () => achievements.filter(a => earnedMap.has(a.id)).reduce((s, a) => s + a.points, 0),
    [achievements, earnedMap]
  )

  const filtered = useMemo(
    () => filter === 'all' ? achievements : achievements.filter(a => a.category === filter),
    [achievements, filter]
  )

  return (
    <>
      <Helmet><title>Achievements — RadarIQ</title></Helmet>
      <div className="p-6 max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,196,175,0.12)', border: '1px solid rgba(0,196,175,0.35)' }}>
              <Trophy className="h-6 w-6" style={{ color: '#00C4AF' }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Your Achievements</h1>
              <p className="text-sm text-muted-foreground">Earned by being awesome at running your store.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: '#F59E0B' }}>Total Points</div>
              <div className="text-xl font-bold" style={{ color: '#F59E0B' }}>{totalPoints.toLocaleString()}</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-card border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</div>
              <div className="text-xl font-bold text-white">{earnedMap.size} <span className="text-sm font-normal text-muted-foreground">/ {achievements.length}</span></div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                filter === c.id
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:text-white'
              )}
            >{c.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(a => {
              const got = earnedMap.get(a.id)
              return (
                <Card key={a.id} className={cn(
                  'p-4 flex gap-3 items-start transition-all',
                  got ? '' : 'opacity-60'
                )} style={got ? { borderColor: 'rgba(0,196,175,0.3)' } : undefined}>
                  <div className="text-4xl shrink-0" style={got ? undefined : { filter: 'grayscale(1)' }}>
                    {got ? a.icon : '🔒'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-white truncate">{a.name}</div>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ color: '#F59E0B', borderColor: 'rgba(245,158,11,0.4)' }}>
                        +{a.points}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {got ? a.description : (LOCKED_HINTS[a.category] ?? 'Keep building to unlock this.')}
                    </p>
                    {got ? (
                      <div className="mt-2 text-[10px] uppercase tracking-wider" style={{ color: '#00C4AF' }}>
                        Earned {new Date(got.awarded_at).toLocaleDateString()}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Lock className="h-3 w-3" /> Locked
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
