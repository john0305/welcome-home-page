import { useState } from 'react'
import { Gift, CheckCircle2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'

const WINDOW_DAYS = 30

export function InviteCodeCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!user) return null

  const existing = user.invite_code ?? null
  const createdAt = user.created_at ? new Date(user.created_at) : null
  const deadline = createdAt ? new Date(createdAt.getTime() + WINDOW_DAYS * 86400000) : null
  const expired = !existing && deadline ? deadline.getTime() < Date.now() : false
  const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000)) : 0

  const onRedeem = async () => {
    setError('')
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return setError('Enter an invite code')
    if (trimmed.length > 32) return setError('Invite code is too long')

    setSaving(true)
    const { error: dbError } = await supabase
      .from('user_profiles')
      .update({ invite_code: trimmed })
      .eq('id', user.id)
    setSaving(false)

    if (dbError) {
      setError(dbError.message)
      return
    }
    toast({ title: 'Invite code applied', description: `${trimmed} saved to your account.` })
    // Refresh page state so user object picks up the new value
    window.location.reload()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          Invite code
        </CardTitle>
        <CardDescription>
          Got an invite from a friend? Apply one code to your account. You can only redeem a code within{' '}
          {WINDOW_DAYS} days of signing up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {existing ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription>
              Invite code <code className="font-mono font-semibold">{existing}</code> is applied to your account.
              Invite codes cannot be changed once set.
            </AlertDescription>
          </Alert>
        ) : expired ? (
          <Alert variant="destructive">
            <Lock className="h-4 w-4" />
            <AlertDescription>
              The {WINDOW_DAYS}-day window to redeem an invite code has ended.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Invite code</Label>
              <Input
                placeholder="e.g. JANE2024"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={32}
                autoCapitalize="characters"
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left to redeem.
              </p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={onRedeem} disabled={saving || !code.trim()}>
              {saving ? 'Applying…' : 'Apply invite code'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
