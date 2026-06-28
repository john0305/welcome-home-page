import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { FixActionCard } from '@/components/actions/FixActionCard'
import type { FixActionRow } from '@/hooks/useFixActions'

interface Props {
  factorKey: string
  listingId?: string | null
}

/**
 * Renders an embedded FixActionCard inside an Echo message.
 * - If a pending fix_action already exists for this factor+listing, use it.
 * - Otherwise calls generate-fix-action to create one.
 * - If a superseded action with the same factor+listing exists in the last 14
 *   days, prepends a "Still seeing this — one tap to apply the fix I drafted
 *   last time." wrapper.
 */
export function EchoFixEmbed({ factorKey, listingId }: Props) {
  const { user } = useAuth()
  const [row, setRow] = useState<FixActionRow | null>(null)
  const [wrapperText, setWrapperText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        // 1. Look for an existing PENDING row
        let q = supabase
          .from('fix_actions')
          .select('*, listing:listings(id, title, etsy_listing_id)')
          .eq('user_id', user.id)
          .eq('factor_key', factorKey)
          .eq('status', 'pending')
        q = listingId ? q.eq('listing_id', listingId) : q.is('listing_id', null)
        const { data: existing } = await q.maybeSingle()

        if (existing) {
          if (!cancelled) {
            setRow(existing as unknown as FixActionRow)
            setLoading(false)
          }
          return
        }

        // 2. Look for a SUPERSEDED row in the last 14 days — repeat-mention copy
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
        let sq = supabase
          .from('fix_actions')
          .select('id, listing:listings(title)')
          .eq('user_id', user.id)
          .eq('factor_key', factorKey)
          .eq('status', 'superseded')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(1)
        sq = listingId ? sq.eq('listing_id', listingId) : sq.is('listing_id', null)
        const { data: prior } = await sq.maybeSingle()

        // 3. Generate a fresh fix
        const { data, error: invErr } = await supabase.functions.invoke('generate-fix-action', {
          body: { factor_key: factorKey, listing_id: listingId ?? null, source: 'echo' },
        })
        if (invErr) throw invErr

        const generated = data?.fix_action as FixActionRow | undefined
        if (!generated) {
          if (!cancelled) { setError('Could not generate a fix.'); setLoading(false) }
          return
        }

        // Fetch with joined listing for the title
        const { data: full } = await supabase
          .from('fix_actions')
          .select('*, listing:listings(id, title, etsy_listing_id)')
          .eq('id', generated.id)
          .maybeSingle()

        if (cancelled) return
        setRow((full as unknown as FixActionRow) ?? generated)
        if (prior) {
          const title = (prior.listing as { title?: string } | null)?.title ?? 'this listing'
          setWrapperText(`Still seeing this on ${title} — one tap to apply the fix I drafted last time.`)
        }
        setLoading(false)
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed'); setLoading(false) }
      }
    })()

    return () => { cancelled = true }
  }, [factorKey, listingId, user?.id])

  if (loading) return (
    <div className="mt-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-slate-400">
      Drafting the fix…
    </div>
  )
  if (error || !row) return null

  return (
    <div className="mt-2">
      {wrapperText && (
        <p className="mb-1.5 text-[11px] italic text-amber-300">{wrapperText}</p>
      )}
      <FixActionCard row={row} compact onChange={() => setRow(null)} />
    </div>
  )
}
