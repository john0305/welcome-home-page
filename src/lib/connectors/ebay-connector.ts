/**
 * eBay Platform Connector (STUB)
 * Not yet implemented — registers itself so the UI can show "coming soon" state.
 */

import { ConnectorRegistry } from '@/types/platform'
import type { PlatformConnector } from '@/types/platform'
import type { EtsyListing, SaleRecord } from '@/types'

const EbayConnector: PlatformConnector = {
  platform: 'ebay',
  displayName: 'eBay',
  iconUrl: 'https://www.ebay.com/favicon.ico',

  oauthConfig: {
    clientId: '',
    redirectUri: '',
    scopes: [],
    authorizationUrl: 'https://auth.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.ebay.com/identity/v1/oauth2/token',
    usesPKCE: false,
  },

  buildAuthUrl() { throw new Error('eBay connector not yet implemented') },
  exchangeCode() { throw new Error('eBay connector not yet implemented') },
  refreshToken() { throw new Error('eBay connector not yet implemented') },
  validateToken() { return Promise.resolve(false) },
  getShopInfo() { throw new Error('eBay connector not yet implemented') },
  syncListings() { throw new Error('eBay connector not yet implemented') },
  getListing() { throw new Error('eBay connector not yet implemented') },
  updateListing() { throw new Error('eBay connector not yet implemented') },
  createListing() { throw new Error('eBay connector not yet implemented') },
  uploadListingImage() { throw new Error('eBay connector not yet implemented') },
  getSales() { throw new Error('eBay connector not yet implemented') },
}

ConnectorRegistry.register(EbayConnector)
export { EbayConnector }
