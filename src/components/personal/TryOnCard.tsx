import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, Sparkles } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

// Single feature-flag check. Flip to `true` when launching for pro/agency.
const TRYON_ENABLED = (import.meta.env.VITE_TRYON_ENABLED as string | undefined) === 'true'

export function TryOnCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [notified, setNotified] = useState(false)

  async function notifyMe() {
    if (!user?.id || notified) return
    const { error } = await supabase
      .from('feature_waitlist' as never)
      .insert({ user_id: user.id, feature_key: 'personal_tryon' } as never)
    if (error && error.code !== '23505') {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      return
    }
    setNotified(true)
    toast({ title: "You're on the list — we'll email when it's live." })
  }

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Virtual try-on
          {!TRYON_ENABLED && <Badge variant="outline" className="text-[10px] uppercase">Coming soon</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">See how a piece looks on a real model — generated in seconds.</p>
      </CardHeader>
      <CardContent>
        <div className={TRYON_ENABLED ? '' : 'pointer-events-none select-none opacity-50'}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UploadZone label="Garment photo" />
            <UploadZone label="Model photo" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['Top', 'Bottom', 'Dress', 'Accessory'].map(b => (
              <button key={b} type="button" disabled className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{b}</button>
            ))}
          </div>
          <Button disabled className="mt-4">
            <Sparkles className="h-4 w-4 mr-1.5" /> Generate try-on
          </Button>
        </div>

        {!TRYON_ENABLED && (
          <div className="mt-4 rounded-md border border-dashed bg-muted/20 p-4 text-center">
            <Badge className="mb-2">Coming soon</Badge>
            <p className="text-sm text-foreground">Virtual try-on is on its way.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pro and Agency members will get personal try-ons included when it launches.
            </p>
            <button
              type="button"
              onClick={notifyMe}
              disabled={notified}
              className="mt-3 text-xs font-medium text-primary underline disabled:no-underline disabled:text-muted-foreground"
            >
              {notified ? '✓ You’re on the list' : 'Notify me when it’s live'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UploadZone({ label }: { label: string }) {
  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-muted/20 text-muted-foreground">
      <ImageIcon className="h-5 w-5" />
      <span className="text-xs">{label}</span>
    </div>
  )
}
