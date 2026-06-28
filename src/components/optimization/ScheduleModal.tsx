import { useState } from 'react'
import { Sparkles, Zap, Clock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'

interface ScheduleModalProps {
  listingIds: string[]
  open: boolean
  onClose: () => void
}

const NIGHTLY_TYPES = ['title', 'tags', 'description'] as const

export function ScheduleModal({ listingIds, open, onClose }: ScheduleModalProps) {
  const { addToQueue, listings } = useApp()
  const { user } = useAuth()
  const { toast } = useToast()
  const [timing, setTiming] = useState<'immediate' | 'nightly'>('nightly')
  const [submitting, setSubmitting] = useState(false)

  const selectedListings = listings.filter(l => listingIds.includes(l.id))

  const handleSchedule = async () => {
    if (timing === 'immediate') {
      listingIds.forEach(id => addToQueue(id))
      toast({
        title: `${listingIds.length} listing${listingIds.length > 1 ? 's' : ''} scheduled`,
        description: 'Running now...',
        variant: 'success',
      })
      onClose()
      return
    }

    if (!user?.id) {
      toast({ title: 'Sign in required', description: 'Please sign in to schedule listings.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const rows = listingIds.flatMap(listing_id =>
        NIGHTLY_TYPES.map(type => ({
          user_id: user.id,
          listing_id,
          type,
          status: 'queued',
        }))
      )
      const { error } = await supabase.from('optimizations').insert(rows)
      if (error) throw error
      listingIds.forEach(id => addToQueue(id))
      toast({
        title: `${listingIds.length} listing${listingIds.length > 1 ? 's' : ''} scheduled`,
        description: "Queued for tonight's batch run (50% discount).",
        variant: 'success',
      })
      onClose()
    } catch (e) {
      toast({
        title: 'Could not schedule',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Schedule Optimization
          </DialogTitle>
          <DialogDescription>
            {listingIds.length === 1
              ? `Schedule "${selectedListings[0]?.title ?? 'this listing'}" for AI optimization.`
              : `Schedule ${listingIds.length} listings for AI optimization.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm font-medium">When should this run?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${timing === 'immediate' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
              onClick={() => setTiming('immediate')}
            >
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Right now</p>
                <p className="text-xs text-muted-foreground">Runs immediately</p>
              </div>
            </button>
            <button
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${timing === 'nightly' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
              onClick={() => setTiming('nightly')}
            >
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Tonight</p>
                <p className="text-xs text-muted-foreground">Nightly batch run</p>
              </div>
            </button>
          </div>

          {selectedListings.length > 0 && (
            <div className="rounded-md bg-muted p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Listings to optimize:</p>
              {selectedListings.slice(0, 3).map(l => (
                <p key={l.id} className="text-xs truncate">• {l.title}</p>
              ))}
              {selectedListings.length > 3 && (
                <p className="text-xs text-muted-foreground">...and {selectedListings.length - 3} more</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={submitting} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
