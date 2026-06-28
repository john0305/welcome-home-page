import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadarIcon } from '@/components/layout/Logo'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be under 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  inviteCode: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const inputStyle = { background: "hsl(var(--surface-1))", borderColor: "hsl(var(--border))", color: '#f8fafc' }

export default function CompleteProfile() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', username: '', inviteCode: '' },
  })

  useEffect(() => {
    if (user) {
      const suggestedUsername =
        user.username && !user.username.includes('@') ? user.username : ''
      reset({
        fullName: user.full_name ?? '',
        username: suggestedUsername,
        inviteCode: '',
      })
    }
  }, [user, reset])

  const onSubmit = async (data: FormData) => {
    setError('')
    if (!supabase || !user) {
      setError('Session unavailable. Please sign in again.')
      return
    }

    const updates: Record<string, unknown> = {
      username: data.username,
      full_name: data.fullName,
      settings: { ...(user.settings ?? {}), profile_completed: true },
    }
    if (data.inviteCode && data.inviteCode.trim()) {
      updates.invite_code = data.inviteCode.trim()
    }

    const { error: dbError } = await supabase
      .from('user_profiles')
      .update(updates as never)
      .eq('id', user.id)

    if (dbError) {
      setError(dbError.message.includes('duplicate') ? 'That username is taken.' : dbError.message)
      return
    }

    await supabase.auth.updateUser({
      data: { username: data.username, full_name: data.fullName },
    })

    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'new-user-signup-admin',
          idempotencyKey: `signup-admin-google-${user.id}`,
          templateData: {
            email: user.email,
            fullName: data.fullName,
            username: data.username,
            provider: 'google',
            inviteCode: data.inviteCode?.trim() || null,
            signedUpAt: new Date().toISOString(),
          },
        },
      })
    } catch (err) {
      console.warn('admin signup notification failed', err)
    }

    await refreshProfile()
    navigate('/app/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: "hsl(var(--background))", fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <RadarIcon size={40} animated />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
            Finish setting up your account
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Pick a username so other sellers can find you.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Full name</Label>
            <Input {...register('fullName')} style={inputStyle} className="h-10 text-sm placeholder:text-slate-600" />
            {errors.fullName && <p className="text-xs text-red-400">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Username</Label>
            <Input placeholder="moonlit_crafts" {...register('username')} style={inputStyle} className="h-10 text-sm placeholder:text-slate-600" />
            {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Invite code (optional)</Label>
            <Input placeholder="EARLY2027" {...register('inviteCode')} style={inputStyle} className="h-10 text-sm placeholder:text-slate-600" />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl font-bold text-foreground transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: "hsl(var(--primary))", boxShadow: '0 8px 24px hsl(var(--primary) / 0.25)' }}
          >
            {isSubmitting ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
