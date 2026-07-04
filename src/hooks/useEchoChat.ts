import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { PageContext } from './usePageContext'

const FREE_LIMIT_FALLBACK = 15

export interface EchoMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  was_answered: boolean
  created_at: string
  optimistic?: boolean
}

export interface EchoUsage {
  used: number
  limit: number          // -1 = unlimited
  tier: string
  atLimit: boolean
}

export type EchoErrorKind = 'too_long' | 'rate_limited' | 'other'

const SESSION_KEY = 'echo:sessionId'
const MAX_LEN = 600

export function useEchoChat() {
  const { user } = useAuth()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<EchoMessage[]>([])
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [usage, setUsage] = useState<EchoUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<EchoErrorKind | null>(null)
  const [contextLoaded, setContextLoaded] = useState(false)
  const lastAssistantSeenRef = useRef<string | null>(null)

  // Resume: most-recent session within last 24h, or sessionStorage hint.
  useEffect(() => {
    if (!user?.id) { setLoadingHistory(false); return }
    let cancelled = false

    ;(async () => {
      const hinted = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(1)

      const sid = hinted && sessions?.some((s) => s.id === hinted)
        ? hinted
        : (sessions?.[0]?.id ?? null)

      if (cancelled) return
      setSessionId(sid)
      if (sid) {
        const { data } = await supabase
          .from('chat_messages')
          .select('id, role, content, was_answered, created_at')
          .eq('session_id', sid)
          .order('created_at', { ascending: true })
          .limit(200)
        if (!cancelled && data) {
          const mapped = data.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            was_answered: m.was_answered,
            created_at: m.created_at,
          }))
          setMessages(mapped)
          const lastAsst = [...mapped].reverse().find((m) => m.role === 'assistant')
          if (lastAsst) lastAssistantSeenRef.current = lastAsst.id
        }
      }
      setLoadingHistory(false)
    })()

    return () => { cancelled = true }
  }, [user?.id])

  const clearError = useCallback(() => { setError(null); setErrorKind(null) }, [])

  const sendMessage = useCallback(async (text: string, pageCtx: PageContext) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    clearError()

    if (trimmed.length > MAX_LEN) {
      setError('Message is too long — please keep it under 600 characters.')
      setErrorKind('too_long')
      return
    }

    setSending(true)

    const tempId = `tmp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: trimmed,
        was_answered: true,
        created_at: new Date().toISOString(),
        optimistic: true,
      },
    ])

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('echo-chat', {
        body: {
          sessionId,
          message: trimmed,
          pageContext: {
            route: pageCtx.route,
            pageLabel: pageCtx.pageLabel,
            listingId: pageCtx.listingId,
            shopId: pageCtx.shopId,
          },
        },
      })

      if (invokeErr) {
        // Pull the real status + error code out of the response so distinct
        // failures (daily quota, AI rate limit, AI credits, server error) get
        // distinct messages instead of one generic "something went wrong".
        const ctx = (invokeErr as { context?: Response }).context
        const status = ctx?.status
        let code = ''
        try {
          const body = ctx && typeof ctx.clone === 'function' ? await ctx.clone().json() : null
          code = typeof body?.error === 'string' ? body.error : ''
        } catch { /* body wasn't JSON */ }
        console.error('[echo-chat] request failed', { status, code, invokeErr })

        if (status === 429 && code === 'chat_limit_reached') {
          setUsage((u) => u ? { ...u, atLimit: true } : { used: FREE_LIMIT_FALLBACK, limit: FREE_LIMIT_FALLBACK, tier: 'free', atLimit: true })
          setError("You've used today's Echo chats on your current plan — they reset tomorrow.")
          setErrorKind('rate_limited')
        } else if (status === 429) {
          setError("I'm getting a lot of questions right now — give me a moment and try again.")
          setErrorKind('rate_limited')
        } else if (status === 402 || code === 'ai_credits_exhausted') {
          setError("My AI service hit its usage limit — the team's been notified automatically. Try again in a little while.")
          setErrorKind('other')
        } else if (status === 400) {
          setError('Message is too long — please keep it under 600 characters.')
          setErrorKind('too_long')
        } else {
          setError('Something went wrong on my end. Try again in a moment.')
          setErrorKind('other')
        }
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        return
      }

      const newSid: string = data.sessionId
      if (newSid && newSid !== sessionId) {
        setSessionId(newSid)
        sessionStorage.setItem(SESSION_KEY, newSid)
      }

      const { data: latest } = await supabase
        .from('chat_messages')
        .select('id, role, content, was_answered, created_at')
        .eq('session_id', newSid)
        .order('created_at', { ascending: false })
        .limit(2)
      const fresh = (latest ?? []).slice().reverse().map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        was_answered: m.was_answered,
        created_at: m.created_at,
      }))
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...fresh])

      if (data.usage) {
        const u = data.usage
        setUsage({
          used: u.used,
          limit: u.limit,
          tier: u.tier,
          atLimit: u.limit !== -1 && u.used >= u.limit,
        })
      }
      if (typeof data.context_loaded === 'boolean') setContextLoaded(data.context_loaded)
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setError('Something went wrong on my end. Try again in a moment.')
      setErrorKind('other')
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, clearError])

  const submitFeedback = useCallback(async (
    messageId: string,
    rating: 'up' | 'down',
    reason?: 'off_topic' | 'inaccurate' | 'not_helpful',
  ) => {
    if (!user?.id) return
    await supabase.from('chat_feedback').upsert(
      { message_id: messageId, user_id: user.id, rating, reason: reason ?? null },
      { onConflict: 'message_id,user_id' },
    )
  }, [user?.id])

  return {
    sessionId,
    messages,
    sending,
    loadingHistory,
    usage,
    error,
    errorKind,
    clearError,
    sendMessage,
    submitFeedback,
    contextLoaded,
  }
}
