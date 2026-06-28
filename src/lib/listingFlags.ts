/**
 * Listing user-flag helpers.
 *
 * Flags let users (or the optimization flow itself) mark a listing as
 * already-actioned so insight lists (Zone 2 levers, etc.) suppress or
 * re-label it instead of nagging the user about something they handled.
 */
import { supabase } from '@/integrations/supabase/client'

export type ListingFlagType =
  | 'optimized_monitoring'
  | 'optimized_confirmed'
  | 'snoozed'
  | 'deferred'

export interface ListingUserFlag {
  id: string
  listing_id: string
  user_id: string
  flag_type: ListingFlagType
  applied_at: string
  expires_at: string | null
  measurement_window_end: string | null
  notes: string | null
}

const MONITORING_WINDOW_DAYS = 30
const SNOOZE_DAYS = 30

export type FlagsByListingId = Map<string, ListingUserFlag[]>

/** Fetch all active (non-expired snooze) flags for the current user. */
export async function fetchUserFlags(userId: string): Promise<FlagsByListingId> {
  const { data, error } = await supabase
    .from('listing_user_flags')
    .select('id, listing_id, user_id, flag_type, applied_at, expires_at, measurement_window_end, notes')
    .eq('user_id', userId)
  if (error || !data) return new Map()
  const now = Date.now()
  const map: FlagsByListingId = new Map()
  for (const row of data as ListingUserFlag[]) {
    // Skip expired snoozes (cleanup happens lazily).
    if (row.flag_type === 'snoozed' && row.expires_at && new Date(row.expires_at).getTime() < now) continue
    const list = map.get(row.listing_id) ?? []
    list.push(row)
    map.set(row.listing_id, list)
  }
  return map
}

/** Insert/upsert a flag. Returns the row or null on failure. */
export async function applyFlag(input: {
  listingId: string
  userId: string
  flagType: ListingFlagType
  notes?: string
}): Promise<ListingUserFlag | null> {
  const now = new Date()
  let expires_at: string | null = null
  let measurement_window_end: string | null = null
  if (input.flagType === 'snoozed') {
    expires_at = new Date(now.getTime() + SNOOZE_DAYS * 86_400_000).toISOString()
  }
  if (input.flagType === 'optimized_monitoring') {
    measurement_window_end = new Date(now.getTime() + MONITORING_WINDOW_DAYS * 86_400_000).toISOString()
  }
  const { data, error } = await supabase
    .from('listing_user_flags')
    .upsert(
      {
        listing_id: input.listingId,
        user_id: input.userId,
        flag_type: input.flagType,
        applied_at: now.toISOString(),
        expires_at,
        measurement_window_end,
        notes: input.notes ?? null,
      },
      { onConflict: 'listing_id,user_id,flag_type' },
    )
    .select()
    .maybeSingle()
  if (error) return null
  return data as ListingUserFlag | null
}

/** Remove all flags of any type for this listing for the current user. */
export async function removeAllFlags(listingId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('listing_user_flags')
    .delete()
    .eq('listing_id', listingId)
    .eq('user_id', userId)
  return !error
}

/** Remove a specific flag type. */
export async function removeFlag(listingId: string, userId: string, flagType: ListingFlagType): Promise<boolean> {
  const { error } = await supabase
    .from('listing_user_flags')
    .delete()
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .eq('flag_type', flagType)
  return !error
}

/** Convenience: should this listing be hidden from suggestion lists entirely? */
export function isHidden(flags: ListingUserFlag[] | undefined): boolean {
  if (!flags || flags.length === 0) return false
  return flags.some(f => f.flag_type === 'snoozed' || f.flag_type === 'deferred' || f.flag_type === 'optimized_confirmed')
}

/** Convenience: is this listing in the "recently optimized, awaiting results" window? */
export function isMonitoring(flags: ListingUserFlag[] | undefined): ListingUserFlag | null {
  if (!flags) return null
  return flags.find(f => f.flag_type === 'optimized_monitoring') ?? null
}
