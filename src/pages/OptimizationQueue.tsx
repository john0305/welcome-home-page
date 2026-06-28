import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Play, Trash2, Clock, Zap, CheckCircle2, XCircle, ShoppingBag } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { useApp } from '@/contexts/AppContext'
import { useToast } from '@/hooks/use-toast'
import { formatRelative } from '@/lib/utils'
import { OptimizationUsageBanner } from '@/components/optimization/OptimizationLimitGate'
import { SampleDataBanner } from '@/components/SampleDataBanner'

const statusConfig = {
  pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pending' },
  in_progress: { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/15', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Ready to review' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
}

const priorityColor = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-muted-foreground/40',
}

export default function OptimizationQueue() {
  const { queue, removeFromQueue } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()

  const pending = queue.filter(q => q.status === 'pending')
  const inProgress = queue.filter(q => q.status === 'in_progress')
  const completed = queue.filter(q => q.status === 'completed')
  const failed = queue.filter(q => q.status === 'failed')

  const handleRunNow = () => {
    toast({
      title: 'Optimization started',
      description: `Running ${pending.length} optimizations...`,
    })
  }

  const handleClear = () => {
    pending.forEach(q => removeFromQueue(q.id))
    toast({ title: 'Queue cleared' })
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Optimization Queue"
        description="Manage and monitor AI optimization runs"
        actions={
          pending.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClear}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear queue
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleRunNow}>
                <Play className="h-3.5 w-3.5" />
                Run all now
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <SampleDataBanner />
        {/* Usage banner — hits free users at the ceiling */}
        <OptimizationUsageBanner />

        {/* Stats */}
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Pending', value: pending.length, color: 'warning' },
            { label: 'In Progress', value: inProgress.length, color: 'info' },
            { label: 'Completed', value: completed.length, color: 'success' },
            { label: 'Failed', value: failed.length, color: 'destructive' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <Badge variant={s.color as 'warning' | 'info' | 'success' | 'destructive'}>{s.value}</Badge>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {queue.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg font-medium">Queue is empty</p>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Listings and click "Optimize" on any listing to add it here.
              </p>
              <Button className="mt-4" onClick={() => navigate('/app/listings')}>
                Browse Listings
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {queue.map(item => {
              const cfg = statusConfig[item.status]
              const Icon = cfg.icon
              return (
                <Card key={item.id} className="group">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>

                    <div className="h-10 w-10 shrink-0 rounded overflow-hidden bg-slate-100">
                      {item.listing_thumbnail ? (
                        <img src={item.listing_thumbnail} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : <ShoppingBag className="h-4 w-4 m-3 text-foreground/80" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        className="text-sm font-medium hover:text-primary transition-colors text-left truncate block w-full"
                        onClick={() => navigate(`/app/listings/${item.listing_id}`)}
                      >
                        {item.listing_title}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge className={`text-[10px] py-0 h-4 rounded-full border-0 ${priorityColor[item.priority]}`}>
                          {item.priority} priority
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.reason}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatRelative(item.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <GradeBadge score={item.current_grade} size="sm" />
                      <div className="flex items-center gap-1">
                        {item.scheduled_for === 'immediate' ? (
                          <Zap className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {item.scheduled_for === 'immediate' ? 'Now' : 'Tonight'}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => removeFromQueue(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
