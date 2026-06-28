import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

const TEAL  = '#00C4AF'
const TEXT  = '#FFFFFF'
const MUTED = '#94A3B8'
const DIM   = '#64748B'
const BORDER = 'hsl(var(--border))'

const FAQS = [
  {
    q: 'Does RadarIQ post to my Etsy shop automatically?',
    a: "Never. Every single change requires your explicit approval before it touches your listings. You see exactly what will change, on which listing, before anything happens. You can also undo any change we've made within 24 hours. Always.",
  },
  {
    q: 'What data can RadarIQ actually see?',
    a: 'We can see your listing data — titles, tags, descriptions, photos, and public performance metrics. We cannot see your revenue, order history, customer names, messages, or any financial information. Etsy keeps that private to you and we have no access to it.',
  },
  {
    q: "Is this against Etsy's terms of service?",
    a: "No. RadarIQ connects through Etsy's official API using the same OAuth process Etsy built for authorized third-party tools. We're a legitimate integration — not a workaround, not a scraper, not a browser extension. Your account stays safe.",
  },
  {
    q: 'What happens to my data if I cancel?',
    a: "Your data stays yours. You can export everything before you leave. We don't sell it, share it with third parties, or use it to train models. When you delete your account, your data is deleted with it.",
  },
  {
    q: 'Why is it free to start?',
    a: "Because we'd rather prove the value before you pay for it. Five free analyses is enough to see exactly what RadarIQ does for your shop — no credit card, no trial countdown, no surprise charge. If it's not useful, you owe us nothing.",
  },
]

export function FaqSection() {
  const [open, setOpen] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('[data-reveal]')
    if (!els) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            setTimeout(() => {
              el.style.opacity = '1'
              el.style.transform = 'translateY(0)'
            }, i * 60)
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -80px 0px' },
    )
    els.forEach((el) => {
      const h = el as HTMLElement
      h.style.opacity = '0'
      h.style.transform = 'translateY(16px)'
      h.style.transition = 'opacity 0.45s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.45s cubic-bezier(0.25,0.46,0.45,0.94)'
      observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <section
      style={{
        padding: '80px 20px',
        background: 'rgba(6,13,31,0.8)',
        borderTop: '1px solid hsl(var(--border))',
      }}
    >
      <div ref={rootRef} style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'rgba(0,196,175,0.10)', borderColor: 'rgba(0,196,175,0.30)', color: TEAL }}
          >
            Before You Connect
          </div>
          <h2
            style={{
              fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
              fontSize: '2rem',
              fontWeight: 800,
              color: TEXT,
              marginTop: 16,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Honest answers to the questions you're actually thinking.
          </h2>
        </div>

        <div>
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div
                key={f.q}
                data-reveal
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="group"
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '18px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isOpen ? TEAL : TEXT,
                      transition: 'color 0.2s',
                    }}
                  >
                    {f.q}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 ml-3"
                    style={{
                      color: isOpen ? TEAL : DIM,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s, color 0.2s',
                    }}
                  />
                </button>
                <div
                  style={{
                    maxHeight: isOpen ? 360 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                  }}
                >
                  <p
                    style={{
                      fontSize: 13.5,
                      color: MUTED,
                      lineHeight: 1.75,
                      padding: '0 0 18px 0',
                    }}
                  >
                    {f.a}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
