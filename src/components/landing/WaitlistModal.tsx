import { useEffect, useState, createContext, useContext, useCallback } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { FoundingTiersBlock, useWaitlistStats, FOUNDING_CAP } from './foundingTiers'
import { getStoredTheme } from '@/lib/theme'

const TEAL = '#00C4AF'
const BG = '#060D1F'
const CARD = '#0D1929'
const BORDER = 'hsl(var(--border))'

type Ctx = { open: (planHint?: string) => void }
const WaitlistCtx = createContext<Ctx>({ open: () => {} })
export const useWaitlist = () => useContext(WaitlistCtx)

export function WaitlistProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [planHint, setPlanHint] = useState<string | undefined>(undefined)
  const open = useCallback((p?: string) => { setPlanHint(p); setIsOpen(true) }, [])
  return (
    <WaitlistCtx.Provider value={{ open }}>
      {children}
      <WaitlistModal isOpen={isOpen} onClose={() => setIsOpen(false)} planHint={planHint} />
    </WaitlistCtx.Provider>
  )
}

function WaitlistModal({ isOpen, onClose, planHint }: { isOpen: boolean; onClose: () => void; planHint?: string }) {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('')
  const [shopInfo, setShopInfo] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const { founding } = useWaitlistStats()

  useEffect(() => {
    if (isOpen && planHint) setPlan(planHint)
  }, [isOpen, planHint])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

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

  const reset = () => {
    setFirstName(''); setEmail(''); setShopInfo(''); setPlan('')
    setStatus('idle'); setMessage('')
  }
  const handleClose = () => { reset(); onClose() }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6 animate-fade-in"
      style={{ background: 'rgba(3,8,20,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6 md:p-7 max-h-[90vh] overflow-y-auto"
        style={{ background: CARD, borderColor: BORDER, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition hover:bg-white/10"
          style={{ color: '#94A3B8' }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {status === 'success' ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
              <Check className="h-7 w-7" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>You're in.</h3>
            <p className="text-sm mb-6" style={{ color: '#94A3B8' }}>{message}</p>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-lg text-sm font-bold transition"
              style={{ background: TEAL, color: BG }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: TEAL }}>
                Join the Beta Waitlist
              </p>
              <h3 className="text-white text-xl font-extrabold leading-snug" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                Reserve your founding spot
              </h3>
              <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
                Your position in line determines your discount.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Field label="First Name">
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="wl-input" placeholder="Your first name" />
              </Field>
              <Field label="Email" required>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="wl-input" placeholder="you@email.com" />
              </Field>
              <Field label="Which plan interests you?" required>
                <select required value={plan} onChange={(e) => setPlan(e.target.value)} className="wl-input" style={{ appearance: 'none' }}>
                  <option value="" disabled>Select a plan…</option>
                  <option value="Free">Free</option>
                  <option value="Starter">Starter</option>
                  <option value="Pro">Pro</option>
                  
                </select>
              </Field>
              <Field label="Tell us about your Etsy shop (optional)">
                <textarea value={shopInfo} onChange={(e) => setShopInfo(e.target.value)} rows={3} className="wl-input resize-none" placeholder="What do you sell? How many listings?" />
              </Field>

              <FoundingTiersBlock />

              {status === 'error' && (
                <p className="text-xs" style={{ color: '#EF4444' }}>{message}</p>
              )}

              <button
                type="submit"
                data-testid="waitlist-submit-button"
                disabled={status === 'loading'}
                className="w-full py-3 rounded-lg text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: TEAL, color: BG, boxShadow: `0 10px 30px ${TEAL}40` }}
              >
                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reserve My Spot'}
              </button>
              <p className="text-[11px] text-center" style={{ color: '#64748B' }}>
                No spam. No credit card. Just your spot in line.
              </p>
            </form>
          </>
        )}

        <style>{`
          .wl-input {
            width: 100%;
            background: hsl(var(--surface-2));
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 10px;
            padding: 10px 12px;
            font-size: 13px;
            color: #fff;
            outline: none;
            transition: border-color .15s, background .15s;
            font-family: inherit;
          }
          .wl-input::placeholder { color: #64748B; }
          .wl-input:focus { border-color: ${TEAL}; background: hsl(var(--border)); }
        `}</style>
      </div>
    </div>
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
