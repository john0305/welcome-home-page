import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppProvider } from '@/contexts/AppContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminRoute, SellerRoute } from '@/components/auth/AdminRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { SplashScreen } from '@/components/SplashScreen'

// ─── Eagerly loaded (entry paths — must be instant) ───────────────────────────
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Register from '@/pages/Register'

// ─── Lazy-loaded (authenticated / non-entry routes) ───────────────────────────
const Dashboard         = lazy(() => import('@/pages/Dashboard'))
const Listings          = lazy(() => import('@/pages/Listings'))
const ListingDetail     = lazy(() => import('@/pages/ListingDetail'))
const NewListing        = lazy(() => import('@/pages/NewListing'))
const OptimizationQueue = lazy(() => import('@/pages/OptimizationQueue'))
const PendingReview     = lazy(() => import('@/pages/PendingReview'))
const Settings          = lazy(() => import('@/pages/Settings'))
const ConnectEtsy       = lazy(() => import('@/pages/ConnectEtsy'))
const ChoosePlan        = lazy(() => import('@/pages/ChoosePlan'))
const StoreProfile      = lazy(() => import('@/pages/StoreProfile'))
const ScoreRoadmap      = lazy(() => import('@/pages/ScoreRoadmap'))
const Intelligence      = lazy(() => import('@/pages/Intelligence'))
const ABTesting         = lazy(() => import('@/pages/ABTesting'))
const Performance       = lazy(() => import('@/pages/Performance'))
const PersonalWorkspace = lazy(() => import('@/pages/PersonalWorkspace'))
const ActionQueue       = lazy(() => import('@/pages/ActionQueue'))
const Achievements      = lazy(() => import('@/pages/Achievements'))
const AuthCallback      = lazy(() => import('@/pages/AuthCallback'))
const Privacy           = lazy(() => import('@/pages/Privacy'))
const Terms             = lazy(() => import('@/pages/Terms'))
const CheckoutReturn    = lazy(() => import('@/pages/CheckoutReturn'))
const CompleteProfile   = lazy(() => import('@/pages/CompleteProfile'))
const Unsubscribe       = lazy(() => import('@/pages/Unsubscribe'))
const Affiliate         = lazy(() => import('@/pages/Affiliate'))

// Admin pages
const Admin                 = lazy(() => import('@/pages/Admin'))
const AdminUsers            = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminActivity         = lazy(() => import('@/pages/admin/AdminActivity'))
const AdminUsage            = lazy(() => import('@/pages/admin/AdminUsage'))
const AdminTokens           = lazy(() => import('@/pages/admin/AdminTokens'))
const AdminABTesting        = lazy(() => import('@/pages/admin/AdminABTesting'))
const AdminBeta             = lazy(() => import('@/pages/admin/AdminBeta'))
const AdminPerformance      = lazy(() => import('@/pages/admin/AdminPerformance'))
const AdminPipeline         = lazy(() => import('@/pages/admin/AdminPipeline'))
const AdminNiches           = lazy(() => import('@/pages/admin/AdminNiches'))
const AdminMarketSettings   = lazy(() => import('@/pages/admin/AdminMarketSettings'))
const AdminAchievements     = lazy(() => import('@/pages/admin/AdminAchievements'))
const LocalDevLogin         = lazy(() => import('@/pages/admin/LocalDevLogin'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

// Minimal spinner shown while a lazy chunk loads. Transparent background so it
// doesn't flash a white screen during dark-mode navigation.
function PageLoader() {
  return (
    <div className="min-h-full flex items-center justify-center bg-background">
      <div className="h-7 w-7 rounded-full border-2 border-primary/15 border-t-primary/60 animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
    <SplashScreen />
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
          <TooltipProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public — eagerly loaded */}
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfile /></ProtectedRoute>} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/checkout/return" element={<CheckoutReturn />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />



                {/* Etsy OAuth callback (can be accessed without auth briefly) */}
                <Route path="/app/connect-etsy/callback" element={
                  <ProtectedRoute>
                    <AppProvider>
                      <ConnectEtsy />
                    </AppProvider>
                  </ProtectedRoute>
                } />

                {/* Admin console — separate layout, no seller chrome */}
                <Route path="/app/admin" element={
                  <ProtectedRoute>
                    <AdminRoute>
                      <AdminLayout />
                    </AdminRoute>
                  </ProtectedRoute>
                }>
                  <Route index element={<Admin />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="activity" element={<AdminActivity />} />
                  <Route path="usage" element={<AdminUsage />} />
                  <Route path="tokens" element={<AdminTokens />} />
                  <Route path="ab-testing" element={<AdminABTesting />} />
                  <Route path="beta" element={<AdminBeta />} />
                  <Route path="performance" element={<AdminPerformance />} />
                  <Route path="achievements" element={<AdminAchievements />} />
                  <Route path="pipeline" element={<AdminPipeline />} />
                  <Route path="niches" element={<AdminNiches />} />
                  <Route path="market-settings" element={<AdminMarketSettings />} />
                  <Route path="dev-login" element={<LocalDevLogin />} />
                </Route>

                {/* Protected seller app — admins get bounced to /app/admin */}
                <Route path="/app" element={
                  <ProtectedRoute>
                    <SellerRoute>
                      <AppProvider>
                        <AppLayout />
                      </AppProvider>
                    </SellerRoute>
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="actions" element={<ScoreRoadmap />} />
                  <Route path="listings" element={<Listings />} />
                  <Route path="listings/:id" element={<ListingDetail />} />
                  <Route path="new-listing" element={<NewListing />} />
                  <Route path="queue" element={<Navigate to="/app/review" replace />} />
                  <Route path="review" element={<PendingReview />} />
                  <Route path="analytics" element={<Navigate to="/app/intelligence" replace />} />
                  <Route path="performance" element={<Performance />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="store-profile" element={<StoreProfile />} />
                  <Route path="insights" element={<Navigate to="/app/score-roadmap" replace />} />
                  <Route path="score-roadmap" element={<ScoreRoadmap />} />
                  <Route path="intelligence" element={<Intelligence />} />
                  <Route path="ab-testing" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="affiliate" element={<Affiliate />} />
                  <Route path="personal-workspace" element={<PersonalWorkspace />} />
                  <Route path="connect-etsy" element={<ConnectEtsy />} />
                  <Route path="choose-plan" element={<ChoosePlan />} />
                  <Route path="achievements" element={<Navigate to="/app/dashboard" replace />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </TooltipProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
