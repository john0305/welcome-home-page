import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { FoundingTiersBlock, useWaitlistStats, FOUNDING_CAP } from './foundingTiers'
import { getStoredTheme } from '@/lib/theme'

const TEAL = '#00C4AF'
const BG = '#060D1F'

export function WaitlistCard({ initialEmail = '', initialFirstName = '' }: { initialEmail?: string; initialFirstName?: string }) {
  const [firstName, setFirstName] = useState(initialFirstName)
  const [email, setEmail] = useState(initialEmail)
  const [plan, setPlan] = useState('')
  const [shopInfo, setShopInfo] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const { founding } = useWaitlistStats()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setStatus('error'); setMessage('Please enter a valid email.'); return
    }
    if (!plan) {
      setStatus('error'); setMessage('Please choose which plan interests you.'); return
    }
    setStatus('loading')
    try {
      const { error } = await supabase
        .from('beta_signups')
        .insert({
          email: email.trim().toLowerCase(),
          first_name: firstName.trim() || null,
          plan_interest: plan,
          shop_info: shopInfo.trim() || null,
          preferred_theme: getStoredTheme(),
        } as any)
      const dup = error?.code === '23505'
      if (error && !dup) throw error

      const isFoundingPlan = plan === 'Pro'
      const foundingFull = founding >= FOUNDING_CAP
      let msg: string
      if (!isFoundingPlan) {
        msg = "You're on the list! You'll receive one free month at launch. We'll email you the moment your spot opens."
      } else if (!foundingFull) {
        msg = "You're a Founding Member! If you're among the first 50 Pro founders you'll lock in 20% off forever. We'll confirm your tier when we launch."
      } else {
        msg = "Founding spots are claimed but you're still getting 15% off your first 12 months as an early member. We'll email you at launch."
      }
      if (dup) msg = "You're already on the list — we'll be in touch with your founding tier at launch."
      setStatus('success'); setMessage(msg)
    } catch {
      setStatus('error'); setMessage('Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
          <Check className="h-7 w-7" />
        </div>
        <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>You're in.</h3>
        <p className="text-sm" style={{ color: '#94A3B8' }}>{message}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
      <Field label="First Name">
        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="wlc-input" placeholder="Your first name" />
      </Field>
      <Field label="Email" required>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="wlc-input" placeholder="you@email.com" />
      </Field>
      <Field label="Which plan interests you?" required>
        <select required value={plan} onChange={(e) => setPlan(e.target.value)} className="wlc-input" style={{ appearance: 'none' }}>
          <option value="" disabled>Select a plan…</option>
          <option value="Free">Free</option>
          <option value="Starter">Starter</option>
          <option value="Pro">Pro</option>
          
        </select>
      </Field>
      <Field label="Tell us about your Etsy shop (optional)">
        <textarea value={shopInfo} onChange={(e) => setShopInfo(e.target.value)} rows={3} className="wlc-input resize-none" placeholder="What do you sell? How many listings?" />
      </Field>

      <FoundingTiersBlock />

      {status === 'error' && (
        <p className="text-xs" style={{ color: '#EF4444' }}>{message}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="riq-btn-primary w-full py-3 rounded-lg text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: TEAL, color: BG, boxShadow: `0 10px 30px ${TEAL}40` }}
      >
        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reserve My Spot →'}
      </button>
      <p className="text-[11px] text-center" style={{ color: '#94A3B8' }}>
        No spam. No credit card. Just your spot in line.
      </p>

      <style>{`
        .wlc-input {
          width: 100%;
          background: hsl(var(--surface-2));
          border: 1px solid hsl(var(--border));
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          /* theme-aware: dark text on the light cream input (was #fff = invisible) */
          color: hsl(var(--foreground));
          outline: none;
          transition: border-color .15s, background .15s;
          font-family: inherit;
        }
        .wlc-input::placeholder { color: hsl(var(--muted-foreground)); }
        .wlc-input:focus { border-color: ${TEAL}; background: hsl(var(--border)); }
      `}</style>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold mb-1.5" style={{ color: '#CBD5E1' }}>
        {label}{required && <span style={{ color: TEAL }}> *</span>}
      </span>
      {children}
    </label>
  )
}
