/**
 * ChromaDB HTTP client
 *
 * ChromaDB is a vector database for semantic search across listings.
 * Run locally: docker run -p 8000:8000 chromadb/chroma
 * Production: deploy to Google Cloud Run or use Chroma Cloud (chromadb.com)
 *
 * Architecture: Frontend never talks to ChromaDB directly.
 * All queries go through Cloud Functions (query-similar, compute-insights).
 * This lib is used server-side in Cloud Functions.
 */

export const CHROMA_URL = import.meta.env.VITE_CHROMA_URL ?? 'http://localhost:8000'
export const isChromaConfigured = !!import.meta.env.VITE_CHROMA_URL

export const CHROMA_COLLECTIONS = {
  listings: 'radariq_listings',           // all listing embeddings (anonymized)
  insights: 'radariq_insights',           // cached insight embeddings
  optimizations: 'radariq_optimizations', // optimization before/after pairs
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChromaCollection {
  name: string
  id: string
  metadata?: Record<string, unknown>
}

export interface ChromaQueryResult {
  ids: string[][]
  distances: number[][]
  documents: string[][]
  metadatas: Record<string, unknown>[][]
}

// ─── Client (for use in Cloud Functions / Supabase Edge Functions) ────────────

export class ChromaClient {
  private baseUrl: string
  private apiKey?: string

  constructor(baseUrl = CHROMA_URL, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    }
  }

  async heartbeat(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/heartbeat`, { headers: this.headers() })
      return res.ok
    } catch {
      return false
    }
  }

  async getOrCreateCollection(name: string, metadata?: Record<string, unknown>): Promise<ChromaCollection> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name, metadata, get_or_create: true }),
    })
    if (!res.ok) throw new Error(`ChromaDB collection error: ${await res.text()}`)
    return res.json()
  }

  async addEmbeddings(collectionId: string, params: {
    ids: string[]
    embeddings: number[][]
    documents: string[]
    metadatas: Record<string, unknown>[]
  }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/add`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`ChromaDB add error: ${await res.text()}`)
  }

  async upsertEmbeddings(collectionId: string, params: {
    ids: string[]
    embeddings: number[][]
    documents: string[]
    metadatas: Record<string, unknown>[]
  }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/upsert`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`ChromaDB upsert error: ${await res.text()}`)
  }

  async queryEmbeddings(collectionId: string, params: {
    query_embeddings: number[][]
    n_results?: number
    where?: Record<string, unknown>
    include?: string[]
  }): Promise<ChromaQueryResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...params, include: params.include ?? ['distances', 'documents', 'metadatas'] }),
    })
    if (!res.ok) throw new Error(`ChromaDB query error: ${await res.text()}`)
    return res.json()
  }

  async deleteEmbeddings(collectionId: string, ids: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/delete`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) throw new Error(`ChromaDB delete error: ${await res.text()}`)
  }

  async getCollection(name: string): Promise<ChromaCollection | null> {
    const res = await fetch(`${this.baseUrl}/api/v1/collections/${name}`, { headers: this.headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`ChromaDB get collection error: ${await res.text()}`)
    return res.json()
  }
}

// ─── Listing text for embedding ───────────────────────────────────────────────
// Produces the document text that gets embedded. Omits personal info.
export function buildListingDocument(listing: {
  title: string
  description: string
  tags: string[]
  materials: string[]
  category?: string
}): string {
  return [
    `TITLE: ${listing.title}`,
    `TAGS: ${listing.tags.join(', ')}`,
    `MATERIALS: ${listing.materials.join(', ')}`,
    `CATEGORY: ${listing.category ?? 'uncategorized'}`,
    `DESCRIPTION: ${listing.description.slice(0, 500)}`,
  ].join('\n')
}

