import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { getStripeEnvironment } from '@/lib/payments'
import { useAuth } from '@/contexts/AuthContext'

export interface SubscriptionRow {
  id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  price_id: string
  product_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  pending_price_id: string | null
  pending_tier: string | null
  pending_change_at: string | null
}

export function useSubscription() {
  const { user, refreshProfile } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user?.id) {
      setSubscription(null)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('environment', getStripeEnvironment())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSubscription(data as SubscriptionRow | null)
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    refetch()
    if (!user?.id) return
    const channel = supabase
      .channel(`sub:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
        () => { refetch(); refreshProfile() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, refetch, refreshProfile])

  const isActive =
    !!subscription &&
    (
      (['active', 'trialing', 'past_due'].includes(subscription.status) &&
        (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())) ||
      (subscription.status === 'canceled' &&
        subscription.current_period_end != null &&
        new Date(subscription.current_period_end) > new Date())
    )

  const endingAt =
    subscription?.cancel_at_period_end && subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null

  return { subscription, isActive, endingAt, loading, refetch }
}
