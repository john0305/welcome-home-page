import React, { useEffect, useRef, useState } from 'react'
import { X, Maximize2, Minimize2, PanelLeft, PanelRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEchoChat } from '@/hooks/useEchoChat'
import { usePageContext } from '@/hooks/usePageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useShopIntelligence } from '@/hooks/useShopIntelligence'
import { getSampleQuestions } from '@/lib/sampleQuestions'
import { getOpeningMessage } from '@/lib/echo/openingMessage'
import { EchoMessage } from './EchoMessage'
import { EchoComposer } from './EchoComposer'


interface Props {
  onClose: () => void
  /** Called whenever a new assistant message id is rendered. */
  onAssistantMessage?: (id: string) => void
}

function MiniRadarDot() {
  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center" aria-hidden>
      <span className="echo-mini-dot-sweep absolute inset-0 rounded-full" />
      <span className="echo-mini-dot-inner" />
    </span>
  )
}

export function EchoPanel({ onClose, onAssistantMessage }: Props) {
  const pageCtx = usePageContext()
  const { user } = useAuth()
  const { intelligence } = useShopIntelligence(user?.id)
  const {
    messages, sending, loadingHistory, usage, error, errorKind,
    sendMessage, submitFeedback, clearError, contextLoaded,
  } = useEchoChat()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [expanded, setExpanded] = useState(false)
  // Panel side (Section 9a): default right, but the seller can move it left
  // when it covers something they're reading. Persisted across sessions.
  const [side, setSide] = useState<'left' | 'right'>(() => {
    try { return localStorage.getItem('echo:side') === 'left' ? 'left' : 'right' } catch { return 'right' }
  })
  const toggleSide = () => setSide((s) => {
    const next = s === 'left' ? 'right' : 'left'
    try { localStorage.setItem('echo:side', next) } catch { /* ignore */ }
    return next
  })
  const lastNotifiedRef = useRef<string | null>(null)

  // Desktop click-off minimize (Section 9a): clicking the main page collapses
  // the panel back to the bubble (state is kept — reopening resumes the chat).
  // Buttons that toggle Echo themselves are excluded via [data-echo-toggle].
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!window.matchMedia('(min-width: 768px)').matches) return
      const el = panelRef.current
      const target = e.target as HTMLElement | null
      if (!el || !target) return
      if (el.contains(target)) return
      if (target.closest?.('[data-echo-toggle]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  // Notify parent of new assistant messages so it can manage hasUnread.
  useEffect(() => {
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant' && !m.optimistic)
    if (lastAsst && lastAsst.id !== lastNotifiedRef.current) {
      lastNotifiedRef.current = lastAsst.id
      onAssistantMessage?.(lastAsst.id)
    }
  }, [messages, onAssistantMessage])

  const handleSend = (text: string) => {
    setComposerValue('')
    sendMessage(text, pageCtx)
  }

  const handleChipClick = (q: string) => {
    sendMessage(q, pageCtx)
  }

  const opening = getOpeningMessage(
    { pathname: pageCtx.pathname, shopHealthScore: pageCtx.shopHealthScore },
    pageCtx.listing,
    intelligence,
  )

  const sampleSet = getSampleQuestions(pageCtx)

  const showSamples = messages.length <= 1
  const isListingDetail = pageCtx.pageLabel === 'Listing Detail'

  // Usage helpers
  const limit = usage?.limit ?? -1
  const used = usage?.used ?? 0
  const remaining = limit > 0 ? Math.max(0, limit - used) : Infinity
  const atLimit = usage?.atLimit ?? false
  const showLowNotice = limit > 0 && remaining > 0 && remaining <= 2

  return (
    <>
      {/* Backdrop — only on mobile, stops above the nav so the radar button stays tappable */}
      <div
        className="fixed inset-x-0 top-0 z-40 md:hidden"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Echo chat"
        className={`echo-panel fixed z-50 flex flex-col overflow-hidden border echo-panel-enter
                   inset-x-0 top-0 md:inset-auto md:bottom-[4.5rem] md:rounded-[var(--radius-xl)] ${
                     side === 'left' ? 'md:left-5' : 'md:right-5'
                   } ${
                     expanded
                       ? 'md:w-[min(720px,calc(100vw-2.5rem))] md:h-[min(820px,calc(100vh-6rem))]'
                       : 'md:w-[390px] md:h-[540px]'
                   }`}
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="echo-panel-header flex items-center justify-between px-3.5 pt-3.5 pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <MiniRadarDot />
            <span className="text-sm font-semibold text-foreground">Echo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-label-sm text-muted-foreground/60">{pageCtx.pageLabel}</span>
            <button
              onClick={toggleSide}
              className="hidden md:inline-flex text-slate-500 hover:text-white transition-colors"
              aria-label={side === 'right' ? 'Move Echo to the left side' : 'Move Echo to the right side'}
              title={side === 'right' ? 'Move to left' : 'Move to right'}
            >
              {side === 'right' ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="hidden md:inline-flex text-slate-500 hover:text-white transition-colors"
              aria-label={expanded ? 'Shrink Echo' : 'Expand Echo'}
              title={expanded ? 'Shrink' : 'Expand'}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors"
              aria-label="Close Echo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Subheader */}
        <div className="px-3.5 pb-2 shrink-0 flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-[0.12em] echo-identity text-muted-foreground/40">
            RadarIQ · Service-Disabled Veteran-Owned
          </p>
          {contextLoaded && (
            <span className="echo-shop-text text-[9px] uppercase tracking-wider flex items-center gap-1">
              <span className="echo-shop-dot h-1 w-1 rounded-full" />
              Shop data loaded
            </span>
          )}
        </div>

        {/* Context strip — only on Listing Detail */}
        {isListingDetail && pageCtx.listingTitle && (
          <div className="echo-context-strip mx-3.5 mb-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[11px] shrink-0">
            Currently looking at: <span className="font-semibold">{pageCtx.listingTitle}</span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 pb-3 space-y-3 scrollbar-thin">
          {loadingHistory ? (
            <p className="text-xs text-slate-500 text-center mt-8">Loading…</p>
          ) : (
            <>
              {/* Opening message — always rendered when session has 0 messages */}
              {messages.length === 0 && (
                <EchoMessage
                  id="opening"
                  role="assistant"
                  content={opening}
                  onFeedback={() => {}}
                  hideFeedback
                />
              )}

              {messages.map((m) => (
                <EchoMessage
                  key={m.id}
                  id={m.id}
                  role={m.role}
                  content={m.content}
                  onFeedback={submitFeedback}
                  hideFeedback={m.optimistic || m.role === 'user'}
                />
              ))}

              {/* Sample questions — only with 0 or 1 messages */}
              {showSamples && (
                <div className="space-y-2 pt-1">
                  {([
                    { label: 'Simple', items: sampleSet.simple },
                    { label: 'Advanced', items: sampleSet.advanced },
                    { label: 'Deep Dive', items: sampleSet.deep },
                  ] as const).map((group) => (
                    <div key={group.label} className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-600 px-1">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((q) => (
                          <button
                            key={q}
                            onClick={() => handleChipClick(q)}
                            disabled={sending || atLimit}
                            className="echo-chip text-left text-[11px] px-2.5 py-1"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="echo-typing-bubble px-3.5 py-2.5">
                    <span className="inline-flex gap-1 items-center">
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce bg-primary" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce bg-primary" style={{ animationDelay: '110ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full animate-bounce bg-primary" style={{ animationDelay: '220ms' }} />
                    </span>
                  </div>
                </div>
              )}

              {/* Error bubble */}
              {error && (errorKind === 'rate_limited' || errorKind === 'other') && (
                <div className="flex justify-start">
                  <div className="echo-error-bubble px-3.5 py-2.5 text-xs max-w-[92%]">
                    {error}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Upgrade banners + composer */}
        <div className="echo-panel-footer shrink-0">
          {atLimit ? (
            <div className="p-3.5 text-center space-y-2">
              <p className="text-xs text-amber-300/90">
                You've used all your Echo messages this month. Upgrade to continue.
              </p>
              <Link to="/app/settings?tab=billing" className="echo-upgrade-btn inline-block">
                Upgrade plan →
              </Link>
            </div>
          ) : (
            <>
              {showLowNotice && (
                <div className="px-3.5 pt-2.5 text-[11px] text-amber-300/80">
                  {remaining} message{remaining === 1 ? '' : 's'} remaining.{' '}
                  <Link to="/app/settings?tab=billing" className="underline hover:text-amber-200">
                    Upgrade for more.
                  </Link>
                </div>
              )}
              {errorKind === 'too_long' && (
                <div className="px-3.5 pt-2.5 text-[11px] text-destructive">
                  Message too long — keep it under 600 characters.
                </div>
              )}
              <EchoComposer
                value={composerValue}
                onChange={(v) => { if (errorKind === 'too_long') clearError(); setComposerValue(v) }}
                onSend={handleSend}
                disabled={sending}
              />
            </>
          )}
        </div>

      </div>
    </>
  )
}
