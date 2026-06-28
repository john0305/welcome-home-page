import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface FeatureFlagRow {
  flag_key: string
  label: string
  enabled: boolean
  tier_restriction: string | null
  paused: boolean
  pause_reason: string | null
}

/** Returns true if the flag exists, is enabled, and is not paused. */
export function useFeatureFlag(flagKey: string): boolean {
  const { data } = useQuery({
    queryKey: ['feature_flag', flagKey],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await db
        .from('feature_flags')
        .select('enabled, paused')
        .eq('flag_key', flagKey)
        .maybeSingle()
      return data as { enabled: boolean; paused: boolean } | null
    },
  })
  if (!data) return true // no row = not gated, default allow
  return data.enabled && !data.paused
}

/** Returns all feature flags (for admin panel). */
export function useAllFeatureFlags() {
  return useQuery({
    queryKey: ['feature_flags_all'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('feature_flags')
        .select('*')
        .order('flag_key')
      if (error) throw error
      return (data ?? []) as FeatureFlagRow[]
    },
  })
}
