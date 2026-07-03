// ─── User & Auth ──────────────────────────────────────────────────────────────

export type UserTier = 'free' | 'starter' | 'pro' | 'agency' | 'admin'
export type Platform = 'etsy' | 'ebay' | 'amazon' | 'shopify'

export interface UserProfile {
  id: string
  email: string
  username: string
  full_name?: string
  avatar_url?: string
  tier: UserTier
  created_at: string
  updated_at: string
  settings: UserSettings
  invite_code?: string | null
  invite_code_redeemed_at?: string | null
  is_affiliate?: boolean
  unlimited_quota?: boolean
}

export type AITask = 'grading' | 'titles_tags' | 'descriptions' | 'bulk_insights'
export type AIModelTier = 'flash' | 'pro'

export interface UserSettings {
  default_listing_state: 'draft' | 'active'
  optimization_schedule: 'immediate' | 'nightly'
  notifications_enabled: boolean
  gemini_model: 'gemini-1.5-flash' | 'gemini-1.5-pro'
  /** Per-task AI model selection (paid only). Free users always use flash. */
  ai_models?: Record<AITask, AIModelTier>
  auto_optimize: boolean
  auto_optimize_threshold: number // grade below this triggers optimization
  auto_optimize_interval_days: number
  low_activity_threshold_days: number
}

export const DEFAULT_AI_MODELS: Record<AITask, AIModelTier> = {
  grading: 'flash',
  titles_tags: 'pro',
  descriptions: 'pro',
  bulk_insights: 'flash',
}

// ─── Connected Stores ─────────────────────────────────────────────────────────

export interface ConnectedStore {
  id: string
  user_id: string
  platform: Platform
  shop_id: string
  shop_name: string
  shop_icon_url?: string
  shop_url?: string
  access_token?: string
  refresh_token?: string
  token_expires_at: string
  is_connected: boolean
  last_sync_at?: string
  listing_count?: number
  created_at: string
  is_vacation?: boolean
  vacation_message?: string | null
  vacation_autoreply?: string | null
  currency_code?: string | null
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export type ListingState = 'active' | 'inactive' | 'draft' | 'expired' | 'sold_out'

export interface EtsyListing {
  id: string
  etsy_listing_id: number
  shop_id: string
  user_id: string

  title: string
  description: string
  price: number
  currency_code: string
  quantity: number
  state: ListingState

  tags: string[]
  materials: string[]
  category_id?: number
  taxonomy_id?: number
  taxonomy_path?: string[]
  shipping_profile_id?: number
  shop_section_id?: number
  has_variations: boolean
  is_customizable: boolean
  is_digital: boolean

  image_urls: string[]
  thumbnail_url?: string

  views: number
  favorites: number
  sales_count: number

  etsy_created_at: string
  etsy_updated_at: string
  last_synced_at: string

  current_grade?: number
  current_image_grade?: number
  optimization_count: number
  last_optimized_at?: string

  // Grade decay: stored separately from `score` so the raw grade is preserved
  // and we can reverse the decay cleanly on recovery.
  decay_points?: number
  decay_started_at?: string | null
  needs_attention?: boolean

  // AI-generated clarifying questions from the last grade pass, plus the
  // seller's answers (used to ground the next grade + optimize call).
  clarifying_questions?: string[] | null
  clarifying_answers?: Record<string, string> | null

  created_at: string
  updated_at: string
}

// ─── Grading ──────────────────────────────────────────────────────────────────

export interface ListingGrade {
  id: string
  listing_id: string

  overall_score: number       // 0-100
  title_score: number         // 0-25
  description_score: number   // 0-25
  tags_score: number          // 0-25
  image_score: number         // 0-25

  strengths: string[]
  weaknesses: string[]
  recommendations: string[]

  graded_at: string
  graded_by: string
  views_at_grading: number
  favorites_at_grading: number
  sales_at_grading: number
}

export type GradeLabel = 'A+' | 'A' | 'B' | 'C' | 'D'

export function getGradeLabel(score: number): GradeLabel {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export function getGradeColor(score: number): string {
  // Warm, on-brand ramp (emerald → teal → amber → clay); AA-compliant text
  // weights. No blue (off-brand) and no punishing red on the low end.
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-300'
  if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (score >= 70) return 'text-primary bg-primary/10 border-primary/20'
  if (score >= 60) return 'text-amber-800 bg-amber-50 border-amber-200'
  return 'text-orange-800 bg-orange-50 border-orange-300'
}

// ─── Optimization ─────────────────────────────────────────────────────────────

export type OptimizationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected' | 'accepted'

export interface OptimizationRecord {
  id: string
  listing_id: string
  user_id: string
  listing_title: string
  listing_thumbnail?: string

  status: OptimizationStatus

  original_title: string
  original_description: string
  original_tags: string[]
  original_materials: string[]
  original_grade: number

  optimized_title?: string
  optimized_description?: string
  optimized_tags?: string[]
  optimized_materials?: string[]
  new_grade?: number

  grade_improvement?: number

  accepted_at?: string
  rejected_at?: string
  rejection_reason?: string

  scheduled_at?: string
  started_at?: string
  completed_at?: string
  created_at: string

  model_used: string
  tokens_used?: number
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export interface SaleRecord {
  id: string
  listing_id: string
  listing_title: string
  listing_thumbnail?: string
  etsy_transaction_id: number

  sale_date: string
  sale_price: number
  quantity_sold: number
  buyer_message?: string

  listing_grade_at_sale?: number
  image_grade_at_sale?: number
  optimization_count_at_sale: number
  views_at_sale: number
  favorites_at_sale: number
}

// ─── Dashboard listing row ────────────────────────────────────────────────────
// Fetched via a targeted slim query (13 columns) so the dashboard never has to
// pull full listing rows with descriptions and image arrays. This keeps the
// dashboard snappy regardless of shop size — a 500-listing shop sends ~75KB
// instead of ~1MB.
export interface DashboardListingRow {
  id: string
  title: string
  thumbnail_url?: string | null
  state: string
  current_grade?: number | null   // DB stores this as "score"
  views: number
  favorites: number
  sales_count: number
  price: number
  tags: string[]
  photo_count: number
  video_count?: number
  etsy_listing_id?: string | number | null
  optimization_count: number
  etsy_created_at: string
  /** Last time the row was touched — used for short-lived "recent activity" momentum on the store score. */
  updated_at?: string | null
  quantity?: number
}

// ─── Dashboard / Analytics ────────────────────────────────────────────────────

export interface DashboardStats {
  total_listings: number
  active_listings: number
  avg_listing_grade: number
  avg_image_grade: number
  listings_needing_optimization: number
  listings_never_graded: number
  total_views_30d: number
  total_favorites_30d: number
  total_sales_month: number
  sales_revenue_month: number
  optimization_queue_length: number
  oldest_listing_days: number
  grade_distribution: GradeDistribution
  views_trend: TrendData[]
  sales_trend: TrendData[]
  recent_optimizations: OptimizationRecord[]
}

export interface GradeDistribution {
  a_plus: number
  a: number
  b: number
  c: number
  d: number
  f: number
}

export interface TrendData {
  date: string
  value: number
  label?: string
}

// ─── Service Connections ──────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'pending'

export interface ServiceConnection {
  service: 'etsy' | 'supabase' | 'google_analytics' | 'gemini' | 'neo4j' | 'google_cloud'
  label: string
  status: ConnectionStatus
  last_checked: string
  error_message?: string
  setup_url?: string
  is_required: boolean
}

// ─── Optimization Queue ───────────────────────────────────────────────────────

export interface QueueItem {
  id: string
  listing_id: string
  listing_title: string
  listing_thumbnail?: string
  current_grade: number
  priority: 'high' | 'medium' | 'low'
  reason: string
  scheduled_for: 'immediate' | 'nightly'
  created_at: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

// ─── New Listing Form ─────────────────────────────────────────────────────────

export interface NewListingForm {
  title: string
  description: string
  price: number
  quantity: number
  tags: string[]
  materials: string[]
  category: string
  shipping_profile_id?: string
  is_digital: boolean
  is_customizable: boolean
  images: File[]
  publish_state: 'draft' | 'active'
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export type ListingOptimizationStatus = 'any' | 'never' | 'pending' | 'optimized'

export type ListingAgeBucket = 'any' | 'lt_1m' | '1_3m' | '3_6m' | '6_12m' | '1_2y' | 'gt_2y' | 'gte_90' | 'gte_180'

/**
 * Grade buckets including an explicit "ungraded" choice so sellers can quickly
 * find listings the grader hasn't touched yet — separate from the 0-25 bucket
 * (which is an actual low grade, not a missing one).
 */
export type ListingGradeBucket = 'any' | 'ungraded' | 'zero' | '0_25' | '25_50' | '50_75' | '75_100' | 'lt_60' | '60_79' | '80_plus'

export interface ListingFilters {
  sort_by: 'oldest' | 'newest' | 'recently_optimized' | 'lowest_grade' | 'highest_grade' | 'most_views' | 'least_views' | 'most_favorites' | 'most_sales' | 'highest_price' | 'lowest_price' | 'most_missing_tags' | 'least_missing_tags'
  state: ListingState | 'all'
  grade_range: [number, number]
  date_range?: { from: Date; to: Date }
  search: string
  optimization_status: ListingOptimizationStatus
  age_bucket: ListingAgeBucket
  grade_bucket: ListingGradeBucket
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
