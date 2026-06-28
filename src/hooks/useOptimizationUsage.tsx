import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

const FREE_MONTHLY_LIMIT = 10

export interface OptimizationUsage {
  used: number
  limit: number
  isAtLimit: boolean
  isNearLimit: boolean
  loading: boolean
}

export function useOptimizationUsage(): OptimizationUsage & { refetch: () => Promise<void> } {
  const { user } = useAuth()
  const [used, setUsed] = useState(0)
  const [loading, setLoading] = useState(true)

  const isUnlimited = !!user?.unlimited_quota
  const isPaid = !!user && user.tier !== 'free'
  const limit = isUnlimited || isPaid ? -1 : FREE_MONTHLY_LIMIT

  const refetch = useCallback(async () => {
    if (!user?.id || !supabase) { setLoading(false); return }
    const month = new Date().toISOString().slice(0, 7)
    const { data } = await supabase
      .from('monthly_usage')
      .select('optimizations_used')
      .eq('user_id', user.id)
      .eq('month', month)
      .maybeSingle()
    setUsed(data?.optimizations_used ?? 0)
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    refetch()
    if (!user?.id || !supabase) return
    const channel = supabase
      .channel(`usage:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_usage', filter: `user_id=eq.${user.id}` },
        () => refetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, refetch])

  return {
    used,
    limit,
    isAtLimit: !isUnlimited && !isPaid && used >= FREE_MONTHLY_LIMIT,
    isNearLimit: !isUnlimited && !isPaid && used >= FREE_MONTHLY_LIMIT - 1,
    loading,
    refetch,
  }
}
