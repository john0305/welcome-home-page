import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { EchoFixEmbed } from './EchoFixEmbed'

type FeedbackReason = 'off_topic' | 'inaccurate' | 'not_helpful'

interface Props {
  id: string
  role: 'user' | 'assistant'
  content: string
  onFeedback: (messageId: string, rating: 'up' | 'down', reason?: FeedbackReason) => void
  hideFeedback?: boolean
}

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: 'off_topic', label: 'Off topic' },
  { value: 'inaccurate', label: 'Inaccurate' },
  { value: 'not_helpful', label: 'Not helpful' },
]

export function EchoMessage({ id, role, content, onFeedback, hideFeedback }: Props) {
  const [rated, setRated] = useState<'up' | 'down' | null>(null)
  const [pickingReason, setPickingReason] = useState(false)
  const navigate = useNavigate()

  const isUser = role === 'user'

  const { cleanContent, embeds } = useMemo(() => {
    if (isUser) return { cleanContent: content, embeds: [] as { factorKey: string; listingId: string | null }[] }
    const re = /<<FIX:([a-z_]+)(?::([a-zA-Z0-9-]+))?>>/g
    const found: { factorKey: string; listingId: string | null }[] = []
    const clean = content.replace(re, (_m, k, lid) => {
      found.push({ factorKey: k, listingId: lid ?? null })
      return ''
    }).trim()
    const seen = new Set<string>()
    const dedup = found.filter(f => {
      const key = `${f.factorKey}|${f.listingId ?? ''}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    return { cleanContent: clean, embeds: dedup }
  }, [content, isUser])

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start gap-1.5'}>
      {!isUser && (
        <div className="echo-msg-ai-dot mt-1.5 shrink-0" aria-hidden>
          <div className="echo-msg-ai-dot-inner" />
        </div>
      )}
      <div className={isUser ? 'max-w-[85%]' : 'max-w-[92%] w-full'}>
        <div className={isUser ? 'echo-msg-user px-3 py-2 text-xs text-white' : 'echo-msg-ai px-3 py-2 text-xs'}>
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none
                            prose-p:my-1.5 prose-p:text-xs prose-p:leading-relaxed
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-xs
                            prose-ol:my-1.5 prose-ol:pl-4
                            prose-headings:text-foreground prose-headings:text-sm
                            prose-code:text-[11px] prose-code:bg-black/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                            prose-a:text-primary">
              <ReactMarkdown
                components={{
                  // In-app links navigate client-side (Section 9a: responses
                  // link straight to the page/listing being discussed);
                  // everything else opens in a new tab.
                  a: ({ href, children }) =>
                    href?.startsWith('/app/') ? (
                      <a
                        href={href}
                        onClick={(e) => { e.preventDefault(); navigate(href) }}
                        className="text-primary underline underline-offset-2 font-semibold"
                      >
                        {children}
                      </a>
                    ) : (
                      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                }}
              >
                {cleanContent}
              </ReactMarkdown>
            </div>
          )}
          {!isUser && embeds.length > 0 && (
            <div className="mt-2 space-y-2">
              {embeds.map((e, i) => (
                <EchoFixEmbed key={`${e.factorKey}-${e.listingId ?? 'shop'}-${i}`} factorKey={e.factorKey} listingId={e.listingId} />
              ))}
            </div>
          )}
        </div>

        {!isUser && !hideFeedback && (
          <div className="flex items-center gap-2 mt-1 px-1">
            <button
              onClick={() => { setRated('up'); onFeedback(id, 'up') }}
              disabled={rated !== null}
              className="text-muted-foreground/50 hover:text-emerald-400 disabled:opacity-40 transition-colors"
              aria-label="Helpful"
            >
              <ThumbsUp className={`h-3 w-3 ${rated === 'up' ? 'text-emerald-400 fill-emerald-400' : ''}`} />
            </button>
            <button
              onClick={() => { setPickingReason(true); setRated('down') }}
              disabled={rated !== null}
              className="text-muted-foreground/50 hover:text-red-400 disabled:opacity-40 transition-colors"
              aria-label="Not helpful"
            >
              <ThumbsDown className={`h-3 w-3 ${rated === 'down' ? 'text-red-400 fill-red-400' : ''}`} />
            </button>
            {pickingReason && (
              <div className="flex items-center gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => { onFeedback(id, 'down', r.value); setPickingReason(false) }}
                    className="text-[10px] text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5 border border-border/60 hover:border-border transition-colors"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {rated && !pickingReason && (
              <span className="text-[10px] text-muted-foreground/50">Thanks</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
