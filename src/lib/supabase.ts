import { supabase as cloudSupabase } from '@/integrations/supabase/client'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? cloudSupabase
  : null

// ─── Table helpers ────────────────────────────────────────────────────────────

export const tables = {
  userProfiles: 'user_profiles',
  connectedStores: 'connected_stores',
  listings: 'listings',
  listingGrades: 'listing_grades',
  optimizationRecords: 'optimization_records',
  optimizationQueue: 'optimization_queue',
  salesHistory: 'sales_history',
  analyticsSnapshots: 'analytics_snapshots',
} as const

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, metadata?: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signUp({ email, password, options: { data: metadata } })
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase.auth.signOut()
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}
