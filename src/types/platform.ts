/**
 * Platform Connector Interface
 *
 * Every marketplace (Etsy, eBay, Amazon) implements this interface.
 * Adding a new platform = creating a new connector + registering it.
 * Nothing else in the app changes.
 */

import type { EtsyListing, ConnectedStore, SaleRecord } from './index'

export type SupportedPlatform = 'etsy' | 'ebay' | 'amazon' | 'shopify'

export interface PlatformOAuthConfig {
  clientId: string
  redirectUri: string
  scopes: string[]
  authorizationUrl: string
  tokenUrl: string
  usesPKCE: boolean
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface ShopInfo {
  shop_id: string
  shop_name: string
  shop_url: string
  icon_url?: string
  listing_count: number
  currency_code: string
  country_code: string
}

export interface ListingUpdate {
  title?: string
  description?: string
  tags?: string[]
  materials?: string[]
  price?: number
  quantity?: number
  state?: 'active' | 'draft'
}

export interface NewListingData {
  title: string
  description: string
  price: number
  quantity: number
  tags?: string[]
  materials?: string[]
  state?: 'active' | 'draft'
  taxonomy_id?: number
  shipping_profile_id?: number
  images?: File[]
}

export interface SyncResult {
  synced: number
  failed: number
  errors: string[]
  rate_limit_remaining?: number
}

// ─── The connector interface every platform must implement ────────────────────

export interface PlatformConnector {
  readonly platform: SupportedPlatform
  readonly displayName: string
  readonly iconUrl: string
  readonly oauthConfig: PlatformOAuthConfig

  // Auth
  buildAuthUrl(state: string, codeChallenge?: string): string
  exchangeCode(code: string, verifier?: string): Promise<TokenResponse>
  refreshToken(refreshToken: string): Promise<TokenResponse>

  // Store info
  getShopInfo(accessToken: string, shopId: string): Promise<ShopInfo>

  // Listings
  syncListings(accessToken: string, shopId: string, options?: {
    limit?: number
    offset?: number
    onProgress?: (synced: number, total?: number) => void
  }): Promise<EtsyListing[]>

  getListing(accessToken: string, listingId: string): Promise<EtsyListing>
  updateListing(accessToken: string, shopId: string, listingId: string, updates: ListingUpdate): Promise<EtsyListing>
  createListing(accessToken: string, shopId: string, data: NewListingData): Promise<EtsyListing>
  uploadListingImage(accessToken: string, shopId: string, listingId: string, image: File, rank: number): Promise<string>

  // Sales
  getSales(accessToken: string, shopId: string, options?: { limit?: number; offset?: number }): Promise<SaleRecord[]>

  // Validation
  validateToken(accessToken: string): Promise<boolean>
}

// ─── Connector Registry ───────────────────────────────────────────────────────

class ConnectorRegistryClass {
  private connectors = new Map<SupportedPlatform, PlatformConnector>()

  register(connector: PlatformConnector) {
    this.connectors.set(connector.platform, connector)
  }

  get(platform: SupportedPlatform): PlatformConnector {
    const c = this.connectors.get(platform)
    if (!c) throw new Error(`No connector registered for platform: ${platform}`)
    return c
  }

  getAll(): PlatformConnector[] {
    return Array.from(this.connectors.values())
  }

  isSupported(platform: string): platform is SupportedPlatform {
    return this.connectors.has(platform as SupportedPlatform)
  }
}

export const ConnectorRegistry = new ConnectorRegistryClass()
