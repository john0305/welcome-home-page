import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateShort(date: string | Date): string {
  return format(new Date(date), 'MMM d')
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function daysSince(date: string | Date): number {
  return differenceInDays(new Date(), new Date(date))
}

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural ?? singular + 's'}`
}

/**
 * Sales display rule:
 * - sales_count > 0 → show the number
 * - Active listing with quantity === 1 → "—" (unique item: it can only sell once,
 *   and when it does the listing closes, so a 0 here is meaningless noise)
 * - Otherwise → "0"
 */
export function formatSales(listing: { sales_count?: number | null; quantity?: number | null; state?: string | null }): {
  value: string
  isUnique: boolean
} {
  const sales = listing.sales_count ?? 0
  if (sales > 0) return { value: sales.toLocaleString(), isUnique: false }
  const isUnique = (listing.quantity ?? 0) === 1 && listing.state === 'active'
  return { value: isUnique ? '—' : '0', isUnique }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function encodeBase64(str: string): string {
  return btoa(str)
}

export function generatePKCEChallenge(): { verifier: string; challenge: string } {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return { verifier, challenge: verifier }
}

export function buildEtsyAuthUrl(apiKey: string, redirectUri: string, state: string, codeChallenge: string): string {
  const ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect'
  const scopes = 'listings_r listings_w listings_d shops_r transactions_r profile_r'
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    client_id: apiKey,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${ETSY_AUTH_URL}?${params.toString()}`
}
