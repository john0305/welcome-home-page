import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  applyFlag as applyFlagFn,
  fetchUserFlags,
  removeAllFlags,
  removeFlag as removeFlagFn,
  type FlagsByListingId,
  type ListingFlagType,
} from '@/lib/listingFlags'

/**
 * Centralized hook for listing user-flags. Exposes the per-listing flag map
 * plus mutator helpers that optimistically refresh.
 */
export function useListingFlags() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [flagsByListingId, setFlags] = useState<FlagsByListingId>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) { setFlags(new Map()); setLoading(false); return }
    const map = await fetchUserFlags(userId)
    setFlags(map)
    setLoading(false)
  }, [userId])

  useEffect(() => { void refresh() }, [refresh])

  const applyFlag = useCallback(async (listingId: string, flagType: ListingFlagType, notes?: string) => {
    if (!userId) return null
    const row = await applyFlagFn({ listingId, userId, flagType, notes })
    await refresh()
    return row
  }, [userId, refresh])

  const removeFlag = useCallback(async (listingId: string, flagType?: ListingFlagType) => {
    if (!userId) return false
    const ok = flagType
      ? await removeFlagFn(listingId, userId, flagType)
      : await removeAllFlags(listingId, userId)
    await refresh()
    return ok
  }, [userId, refresh])

  return { flagsByListingId, loading, refresh, applyFlag, removeFlag, userId }
}
