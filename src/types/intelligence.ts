// ─── ChromaDB + Cross-user Intelligence Types ────────────────────────────────

export interface ListingEmbeddingMetadata {
  listing_id: string                 // internal UUID (not Etsy ID)
  user_id_hash: string               // SHA-256 hash — never the real user ID
  category: string
  subcategory?: string
  tags: string[]                     // normalized lowercase
  title_has_handmade: boolean
  title_has_personalized: boolean
  title_has_gift: boolean
  title_length: number
  description_length: number
  tag_count: number
  image_count: number
  price_bucket: 'under_15' | '15_30' | '30_50' | '50_100' | 'over_100'
  listing_grade: number
  image_grade: number
  views_bucket: number               // rounded to nearest 50 for anonymization
  favorites_bucket: number
  sales_count_bucket: number
  optimization_count: number
  days_since_created: number
  day_of_week_created: number        // 0=Sun, 1=Mon...6=Sat
  was_last_optimized: boolean
  last_optimization_accepted: boolean
  platform: string                   // 'etsy'
  indexed_at: string
}

// ─── Intelligence Insight Types ───────────────────────────────────────────────

export type InsightType =
  | 'keyword_trend'          // "Listings with 'handmade' convert 23% better this month"
  | 'timing_tip'             // "Post Tuesday 9-11am → 15% more first-48h views"
  | 'image_benchmark'        // "Your avg 3.2 images vs top sellers' 8.7"
  | 'tag_opportunity'        // "3 of your listings missing 'gift for her' (top 10 tag in category)"
  | 'grade_benchmark'        // "Your avg grade 62 vs category avg 71"
  | 'seasonal_alert'         // "Searches for 'mother's day gift' up 340% — 3 weeks away"
  | 'pricing_signal'         // "$35-45 range shows 18% higher conversion in your category"
  | 'optimization_roi'       // "Accepted optimizations get avg +34% views in 30 days"
  | 'reoptimization_alert'   // "2 listings haven't been optimized in 90+ days and views are dropping"

export type InsightSeverity = 'opportunity' | 'warning' | 'info' | 'trending'

export interface Insight {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  body: string
  metric?: string                  // e.g. "+23% conversion"
  action_label?: string            // CTA label
  action_route?: string            // where to navigate on CTA
  affected_listing_ids?: string[]  // personalized to this user's listings
  data_source: 'platform' | 'category' | 'user'
  confidence: 'high' | 'medium' | 'low'
  valid_until?: string
  created_at: string
}

// ─── Benchmark Report ─────────────────────────────────────────────────────────

export interface CategoryBenchmark {
  category: string
  sample_size: number              // how many listings in this benchmark
  avg_grade: number
  avg_image_count: number
  avg_tag_count: number
  avg_title_length: number
  avg_views_per_listing: number
  avg_favorites_per_listing: number
  avg_sales_per_listing: number
  top_tags: string[]               // most common tags in high-performing listings
  optimal_price_range: [number, number]
  best_day_to_post: string
  best_time_to_post?: string
}

export interface UserBenchmark {
  user_avg_grade: number
  category_avg_grade: number
  grade_percentile: number         // e.g. 45 means better than 45% of sellers
  user_avg_images: number
  category_avg_images: number
  user_avg_tags: number
  category_avg_tags: number
  listings_below_category_avg: number
  listings_above_category_avg: number
  estimated_missed_views_monthly: number  // views lost due to below-avg grades
}

// ─── Trend Data ───────────────────────────────────────────────────────────────

export interface TagTrend {
  tag: string
  category: string
  week_over_week_change: number    // % change
  month_over_month_change: number
  in_top_sellers_pct: number       // % of top sellers using this tag
  search_volume_index: number      // relative, normalized 0-100
  is_rising: boolean
  is_seasonal: boolean
  seasonal_peak_month?: number
}

export interface KeywordInsight {
  keyword: string
  category: string
  presence_in_title_uplift: number   // % improvement in views when in title
  presence_in_description_uplift: number
  presence_in_tags_uplift: number
  user_has_keyword: boolean
  user_listings_missing: number      // how many of user's listings could use this
}

// ─── Optimization Learning ────────────────────────────────────────────────────

export interface OptimizationOutcome {
  listing_id: string
  category: string
  grade_before: number
  grade_after: number
  views_30d_before: number
  views_30d_after: number
  favorites_30d_before: number
  favorites_30d_after: number
  sales_30d_before: number
  sales_30d_after: number
  accepted: boolean
  rejection_category?: string
  days_since_optimization: number
}

export interface PlatformLearning {
  total_optimizations_accepted: number
  avg_grade_improvement: number       // across all accepted optimizations
  avg_views_uplift_30d: number        // % change in views 30 days post-optimization
  avg_favorites_uplift_30d: number
  top_improvement_fields: string[]    // which fields improved listings most
  worst_rejection_categories: string[] // most common rejection reasons
  category_optimization_roi: Record<string, number>  // category → avg view uplift %
}
