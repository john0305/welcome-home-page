export type NotificationType =
  | 'optimization_complete'
  | 'grade_improved'
  | 'listing_sold'
  | 'trend_alert'
  | 'queue_complete'
  | 'sync_complete'
  | 'payment'
  | 'onboarding'
  | 'weekly_report'
  | 'low_quota'
  | 'reoptimize_suggestion'
  | 'error'
  | 'info'

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'browser_push'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  body: string
  read: boolean
  action_label?: string
  action_route?: string
  listing_id?: string
  created_at: string
}

export interface NotificationPreferences {
  // Channels
  in_app: boolean
  email: boolean
  sms: boolean
  browser_push: boolean

  // Events
  optimization_complete: boolean
  grade_improved: boolean
  listing_sold: boolean
  trend_alerts: boolean
  payment_receipts: boolean
  weekly_report: boolean
  reoptimize_suggestions: boolean

  // Email-specific
  email_daily_digest: boolean
  email_instant: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  in_app: true,
  email: true,
  sms: false,
  browser_push: false,
  optimization_complete: true,
  grade_improved: true,
  listing_sold: true,
  trend_alerts: true,
  payment_receipts: true,
  weekly_report: true,
  reoptimize_suggestions: true,
  email_daily_digest: false,
  email_instant: true,
}
