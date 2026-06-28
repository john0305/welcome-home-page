import { useNavigate } from 'react-router-dom'
import { Store, Sparkles, BarChart3, List, ArrowRight, Gauge, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyDashboard() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 animate-fade-in">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Store className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">Welcome to Radar IQ!</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        Connect your Etsy store to get your Store Health Score and see exactly where to start.
      </p>

      <button
        onClick={() => navigate('/app/connect-etsy')}
        className="mt-7 inline-flex items-center gap-2.5 rounded-xl px-7 py-4 text-base font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: '#F26522', boxShadow: '0 12px 32px rgba(242,101,34,0.35)' }}
      >
        <Store className="h-5 w-5" />
        Connect your Etsy store
        <ArrowRight className="h-5 w-5" />
      </button>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 max-w-2xl">
        {[
          { icon: Gauge, label: 'See your Store Health Score (0–100)' },
          { icon: BarChart3, label: 'Grade every active listing automatically' },
          { icon: Target, label: 'Get 3 instant quick wins tailored to your shop' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-primary">
            <item.icon className="h-3.5 w-3.5 opacity-70" />
            <span className="opacity-90">{item.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-12 text-xs text-muted-foreground uppercase tracking-wider font-medium">Here's what you'll see once connected:</p>
      <div className="mt-4 grid w-full max-w-lg gap-3 sm:grid-cols-3 opacity-40 pointer-events-none">
        {[
          { icon: BarChart3, label: 'Grade trends', sub: 'Track improvement over time' },
          { icon: Sparkles, label: 'Optimization queue', sub: 'AI rewrites on autopilot' },
          { icon: List, label: 'Listing health', sub: 'Ranked by opportunity' },
        ].map(c => (
          <Card key={c.label} className="blur-[1px]">
            <CardContent className="p-4 text-center">
              <c.icon className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs font-medium">{c.label}</p>
              <p className="text-[10px] text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
