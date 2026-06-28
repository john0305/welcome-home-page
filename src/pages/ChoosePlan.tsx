import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLANS, PLAN_PRICE_IDS, type PlanId } from '@/lib/payments'
import { useAuth } from '@/contexts/AuthContext'
import { useStripeCheckout } from '@/hooks/useStripeCheckout'
import { markPlanSelected } from '@/lib/onboardingFlags'

type Billing = 'monthly' | 'yearly'

export default function ChoosePlan() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { openCheckout, checkoutElement } = useStripeCheckout()
  const [billing, setBilling] = useState<Billing>('monthly')
  const [loadingId, setLoadingId] = useState<PlanId | null>(null)

  const handleSelect = (planId: PlanId) => {
    if (planId === 'free') {
      markPlanSelected()
      navigate('/app/dashboard')
      return
    }
    const priceId = PLAN_PRICE_IDS[planId][billing]
    setLoadingId(planId)
    markPlanSelected()
    openCheckout({
      priceId,
      customerEmail: user?.email,
      userId: user?.id,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    })
    setLoadingId(null)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-4"
          style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
          <Sparkles className="h-3.5 w-3.5" /> Your shop is connected
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white">Choose your plan</h1>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Start free, upgrade anytime. Every plan includes unlimited listing grading and our full insights dashboard.
        </p>

        <div className="mt-6 inline-flex items-center gap-1 rounded-full border p-1" style={{ borderColor: "hsl(var(--surface-1))", background: "hsl(var(--background))" }}>
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${billing === 'monthly' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}
          >Monthly</button>
          <button
            type="button"
            onClick={() => setBilling('yearly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${billing === 'yearly' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}
          >Yearly <span className="text-primary ml-1">save 20%</span></button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {PLANS.map(plan => {
          const price = billing === 'yearly' ? plan.price_yearly : plan.price_monthly
          const highlighted = (plan as { highlighted?: boolean }).highlighted
          return (
            <Card key={plan.id} className={highlighted ? 'border-primary relative' : 'relative'}>
              {highlighted && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2" style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  Most popular
                </Badge>
              )}
              <CardContent className="p-5 flex flex-col h-full">
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                </div>
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">${price}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  {billing === 'yearly' && plan.price_monthly > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">Billed annually</p>
                  )}
                </div>
                <ul className="space-y-2 mb-5 flex-1">
                  {plan.features.slice(0, 6).map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSelect(plan.id as PlanId)}
                  disabled={loadingId === plan.id}
                  className="w-full gap-2"
                  variant={highlighted ? 'default' : 'outline'}
                  style={highlighted ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' } : undefined}
                >
                  {loadingId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      {plan.id === 'free' ? 'Continue free' : `Choose ${plan.name}`}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="text-center mt-8">
        <button
          type="button"
          onClick={() => { markPlanSelected(); navigate('/app/dashboard') }}
          className="text-xs text-muted-foreground hover:text-white transition-colors"
        >
          Skip — decide later
        </button>
      </div>

      {checkoutElement}
    </div>
  )
}
