import { useState } from 'react'
import { Bell, X, CheckCheck, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useNotifications } from '@/contexts/NotificationContext'
import { usePendingFixCount } from '@/hooks/useFixActions'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'

const severityDot = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications()
  const pendingActions = usePendingFixCount()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  // Badge reflects unread notifications only — pending Shop Health actions
  // have their own surface and can't be "marked read" from this panel.
  const badge = unreadCount

  const handleAction = (n: typeof notifications[0]) => {
    markRead(n.id)
    setOpen(false)
    if (n.action_route) navigate(n.action_route)
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="h-4 w-4" />
        {badge > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between p-3 pb-2">
              <p className="text-sm font-semibold">Notifications</p>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={markAllRead}>
                    <CheckCheck className="h-3 w-3" /> Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {pendingActions > 0 && (
              <>
                <Separator />
                <button
                  onClick={() => { setOpen(false); navigate('/app/actions') }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-primary/5 transition-colors"
                >
                  <Zap className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {pendingActions} issue{pendingActions === 1 ? '' : 's'} in Shop Health
                    </p>
                    <p className="text-[10px] text-muted-foreground">One tap to apply →</p>
                  </div>
                </button>
              </>
            )}
            <Separator />
            <ScrollArea className="max-h-[360px]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                notifications.slice(0, 15).map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer group',
                      !n.read && 'bg-primary/5'
                    )}
                    onClick={() => handleAction(n)}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', severityDot[n.severity], n.read && 'opacity-0')} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs font-medium leading-snug', n.read && 'text-muted-foreground')}>{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(n.created_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => { e.stopPropagation(); dismiss(n.id) }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </ScrollArea>
            {notifications.length > 0 && (
              <>
                <Separator />
                <div className="p-2 text-center">
                  <Button variant="link" size="sm" className="text-xs h-6" onClick={() => { setOpen(false); navigate('/app/settings?tab=notifications') }}>
                    Manage notification settings
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
