import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { UserTier } from '@/types'

export type PersonalKind = 'grade' | 'optimization' | 'tryon'

const LIMITS: Record<UserTier, Record<PersonalKind, number>> = {
  free:    { grade: 0,  optimization: 0,  tryon: 0 },
  starter: { grade: 5,  optimization: 5,  tryon: 0 },
  pro:     { grade: 15, optimization: 15, tryon: 0 },   // tryon locked for all tiers (coming soon)
  agency:  { grade: 40, optimization: 40, tryon: 0 },
  admin:   { grade: 9999, optimization: 9999, tryon: 0 },
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function msUntilUtcMidnight(): number {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  return next.getTime() - now.getTime()
}

export function formatResetIn(): string {
  const ms = msUntilUtcMidnight()
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

export function usePersonalQuota() {
  const { user } = useAuth()
  const tier = (user?.tier ?? 'free') as UserTier

  const query = useQuery({
    queryKey: ['personal-quota', user?.id, todayUtc()],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personal_daily_quotas' as never)
        .select('personal_grades_used, personal_optimizations_used, personal_tryons_used')
        .eq('user_id', user!.id)
        .eq('date', todayUtc())
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      const row = (data as { personal_grades_used?: number; personal_optimizations_used?: number; personal_tryons_used?: number } | null) ?? {}
      return {
        grade: row.personal_grades_used ?? 0,
        optimization: row.personal_optimizations_used ?? 0,
        tryon: row.personal_tryons_used ?? 0,
      }
    },
  })

  const used = query.data ?? { grade: 0, optimization: 0, tryon: 0 }
  const baseLimits = LIMITS[tier] ?? LIMITS.free
  const limits = user?.unlimited_quota
    ? { grade: 9999, optimization: 9999, tryon: 9999 }
    : baseLimits

  return {
    tier,
    used,
    limits,
    isLoading: query.isLoading,
    refetch: query.refetch,
    resetsIn: formatResetIn(),
    tryOnEnabled: false, // single feature-flag check — flip when launching
  }
}

export const PERSONAL_LIMITS = LIMITS
