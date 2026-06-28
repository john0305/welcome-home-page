import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import type { UserTier } from '@/types'

interface PaidFeatureGateProps {
  children: React.ReactNode
  requiredTier?: UserTier
  featureName: string
  description?: string
}


const tierOrder: Record<UserTier, number> = { free: 0, starter: 1, pro: 2, agency: 3, admin: 99 }

export function PaidFeatureGate({ children, requiredTier = 'pro', featureName, description }: PaidFeatureGateProps) {
  const { user } = useAuth()
  const userTier = user?.tier ?? 'free'

  if (tierOrder[userTier] >= tierOrder[requiredTier]) {
    return <>{children}</>
  }

  return (
    <Card className="border-dashed border-primary bg-primary/15">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-slate-800">{featureName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {description ?? `This feature requires a ${requiredTier} plan or higher.`}
          </p>
        </div>
        <Button size="sm" className="mt-1" asChild>
          <Link to="/app/settings?tab=billing">
            Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
