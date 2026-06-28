import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (user.tier !== 'admin') return <Navigate to="/app/dashboard" replace />
  return <>{children}</>
}

/**
 * Wraps seller-facing routes. If an admin lands on one, kick them to the admin console.
 */
export function SellerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user?.tier === 'admin') return <Navigate to="/app/admin" replace />
  return <>{children}</>
}
