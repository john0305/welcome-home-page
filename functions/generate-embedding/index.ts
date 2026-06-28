/**
 * Google Cloud Function: generate-embedding
 * Generates a Gemini text embedding for a listing and stores it in ChromaDB.
 * Called when: listing synced, listing optimized and accepted.
 *
 * Expects: POST { listing_id, user_id }
 * Returns: { success: boolean, chroma_id: string }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ChromaClient, buildListingDocument, CHROMA_COLLECTIONS } from '../../src/lib/chroma'
import { hashUserId, bucketPrice, bucketMetric } from '../../src/lib/intelligence'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const chroma = new ChromaClient(process.env.CHROMA_URL!)

export async function generateEmbedding(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const { listing_id, user_id } = req.body as { listing_id: string; user_id: string }
  if (!listing_id || !user_id) return res.status(400).json({ error: 'Missing required fields' })

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listing_id)
    .single()

  if (!listing) return res.status(404).json({ error: 'Listing not found' })

  try {
    // Build document text (no personal info)
    const document = buildListingDocument({
      title: listing.title,
      description: listing.description,
      tags: listing.tags,
      materials: listing.materials,
      category: listing.taxonomy_path?.[0] ?? 'uncategorized',
    })

    // Generate embedding via Gemini
    const embeddingModel = genAI.getGenerativeModel({ model: 'models/embedding-001' })
    const result = await embeddingModel.embedContent(document)
    const embedding = result.embedding.values

    // Build anonymized metadata
    const userIdHash = await hashUserId(user_id)
    const listingIdHash = await hashUserId(listing_id) // reuse same fn

    const metadata = {
      listing_id: listing_id,               // internal — not Etsy ID
      user_id_hash: userIdHash,
      category: listing.taxonomy_path?.[0] ?? 'uncategorized',
      tags: listing.tags.join(','),
      title_has_handmade: listing.title.toLowerCase().includes('handmade'),
      title_has_personalized: listing.title.toLowerCase().includes('personalized'),
      title_has_gift: listing.title.toLowerCase().includes('gift'),
      title_length: listing.title.length,
      description_length: listing.description.length,
      tag_count: listing.tags.length,
      image_count: listing.image_urls.length,
      price_bucket: bucketPrice(listing.price),
      listing_grade: listing.current_grade ?? 0,
      views_bucket: bucketMetric(listing.views),
      favorites_bucket: bucketMetric(listing.favorites, 10),
      sales_count_bucket: bucketMetric(listing.sales_count, 5),
      optimization_count: listing.optimization_count,
      days_since_created: Math.round((Date.now() - new Date(listing.etsy_created_at).getTime()) / 86400000),
      day_of_week_created: new Date(listing.etsy_created_at).getDay(),
      indexed_at: new Date().toISOString(),
    }

    // Store in ChromaDB
    const collection = await chroma.getOrCreateCollection(CHROMA_COLLECTIONS.listings)
    const chromaId = `listing:${listingIdHash}`

    await chroma.upsertEmbeddings(collection.id, {
      ids: [chromaId],
      embeddings: [embedding],
      documents: [document],
      metadatas: [metadata],
    })

    // Log sync to Supabase
    await supabase.from('chroma_sync_log').upsert({
      listing_id,
      chroma_document_id: chromaId,
      embedding_model: 'models/embedding-001',
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
    })

    return res.status(200).json({ success: true, chroma_id: chromaId })
  } catch (err) {
    console.error('Embedding error:', err)
    await supabase.from('chroma_sync_log').upsert({
      listing_id,
      chroma_document_id: '',
      embedding_model: 'models/embedding-001',
      last_synced_at: new Date().toISOString(),
      sync_status: 'failed',
    })
    return res.status(500).json({ error: String(err) })
  }
}
