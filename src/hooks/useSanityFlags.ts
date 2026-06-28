import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export type SanityFlagType = 'placeholder' | 'profanity' | 'internal_note' | 'price_outlier' | 'text_mismatch'
export type SanityFlagStatus = 'active' | 'dismissed' | 'ignored_permanently' | 'resolved'

export interface SanityFlag {
  id: string
  internal_listing_id: string
  flag_type: SanityFlagType
  field: 'title' | 'description' | 'tags' | 'price'
  flagged_text: string
  match_value: string
  detail: string
  status: SanityFlagStatus
  detected_at: string
  listing?: { id: string; title: string | null; thumbnail_url: string | null; etsy_listing_id: string | null }
}

export const FLAG_TYPE_LABEL: Record<SanityFlagType, string> = {
  placeholder: 'Placeholder text',
  profanity: 'Unintended language',
  internal_note: 'Internal note',
  price_outlier: 'Price outlier',
  text_mismatch: 'Possible mismatch — please verify',
}

export type SanityStatusFilter = SanityFlagStatus | SanityFlagStatus[] | 'all'

export function useSanityFlags(status: SanityStatusFilter = 'active') {
  const { user } = useAuth()
  const [flags, setFlags] = useState<SanityFlag[]>([])
  const [loading, setLoading] = useState(true)

  const statusKey = Array.isArray(status) ? status.join(',') : status

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    let q = supabase
      .from('listing_sanity_flags')
      .select('id, internal_listing_id, flag_type, field, flagged_text, match_value, detail, status, detected_at, listings!internal_listing_id(id, title, thumbnail_url, etsy_listing_id)')
      .eq('user_id', user.id)
      .order('detected_at', { ascending: false })
      .limit(500)
    if (Array.isArray(status)) q = q.in('status', status)
    else if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    if (!error && data) {
      setFlags(data.map((r: any) => ({
        ...r,
        listing: r.listings ?? undefined,
      })))
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, statusKey])

  useEffect(() => { load() }, [load])

  const updateStatus = useCallback(async (id: string, newStatus: SanityFlagStatus) => {
    const patch = newStatus === 'dismissed'
      ? { status: newStatus, dismissed_at: new Date().toISOString() }
      : newStatus === 'active'
        ? { status: newStatus, dismissed_at: null }
        : { status: newStatus }
    const { error } = await supabase.from('listing_sanity_flags').update(patch).eq('id', id)
    if (!error) setFlags((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const restoreAll = useCallback(async () => {
    if (!user?.id) return
    await supabase.from('listing_sanity_flags')
      .update({ status: 'active', dismissed_at: null })
      .eq('user_id', user.id)
      .in('status', ['dismissed', 'ignored_permanently'])
    await load()
  }, [user?.id, load])

  return { flags, loading, reload: load, updateStatus, restoreAll }
}

type SanityScanResult = { ok: boolean; scanned: number; inserted: number; resolved: number }

async function invokeSanityScan(
  body: { scope: 'all' | 'changed' | 'listing_ids'; listing_ids?: string[] },
  accessToken: string,
): Promise<SanityScanResult> {
  const { data, error } = await supabase.functions.invoke('sanity-check-scan', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throw new Error(error.message || 'The sanity check could not be started.')
  if (data?.error) throw new Error(data.error)
  return data as SanityScanResult
}

export async function runSanityCheck(
  scope: 'all' | 'changed' = 'all',
  onProgress?: (message: string) => void,
) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    throw new Error('Please sign in again before running the sanity check.')
  }

  if (scope !== 'all') return invokeSanityScan({ scope }, accessToken)

  const listingIds: string[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('listings')
      .select('id')
      .eq('state', 'active')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    listingIds.push(...((data ?? []) as Array<{ id: string }>).map((row) => row.id))
    if (!data || data.length < pageSize) break
  }

  if (listingIds.length === 0) return { ok: true, scanned: 0, inserted: 0, resolved: 0 }

  const totals: SanityScanResult = { ok: true, scanned: 0, inserted: 0, resolved: 0 }
  const chunkSize = 5
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    onProgress?.(`Scanning ${Math.min(i + chunkSize, listingIds.length)} of ${listingIds.length} listings…`)
    const result = await invokeSanityScan({ scope: 'listing_ids', listing_ids: listingIds.slice(i, i + chunkSize) }, accessToken)
    totals.scanned += result.scanned
    totals.inserted += result.inserted
    totals.resolved += result.resolved
  }
  return totals
}
