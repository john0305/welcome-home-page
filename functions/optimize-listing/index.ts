/**
 * Google Cloud Function: optimize-listing
 * Uses Gemini AI to generate SEO-optimized listing content.
 *
 * Expects: POST { listing_id, user_id, model? }
 * Returns: { optimization_id, optimized: OptimizationResult }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function optimizeListing(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const { listing_id, user_id, model = 'gemini-1.5-flash' } = req.body as {
    listing_id: string
    user_id: string
    model?: string
  }

  if (!listing_id || !user_id) return res.status(400).json({ error: 'Missing required fields' })

  // Fetch listing and current grade
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listing_id)
    .eq('user_id', user_id)
    .single()

  if (!listing) return res.status(404).json({ error: 'Listing not found' })

  // Create optimization record
  const { data: record, error: insertErr } = await supabase
    .from('optimization_records')
    .insert({
      listing_id,
      user_id,
      status: 'in_progress',
      original_title: listing.title,
      original_description: listing.description,
      original_tags: listing.tags,
      original_materials: listing.materials,
      original_grade: listing.current_grade ?? 0,
      started_at: new Date().toISOString(),
      model_used: model,
    })
    .select()
    .single()

  if (insertErr || !record) return res.status(500).json({ error: 'Failed to create optimization record' })

  try {
    const geminiModel = genAI.getGenerativeModel({ model })

    const prompt = `You are an expert Etsy SEO specialist. Optimize this listing.

CURRENT LISTING (Grade: ${listing.current_grade ?? 'ungraded'}/100):
Title: "${listing.title}"
Description: "${listing.description.slice(0, 1200)}"
Tags: ${listing.tags.join(', ')}
Materials: ${listing.materials.join(', ')}
Images: ${listing.image_urls.length}

REQUIREMENTS:
- Title: 100-140 chars, keyword-rich
- Description: 600-1500 words, structured
- Tags: Exactly 13 tags, varied phrases
- Materials: Complete and specific

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "tags": ["...", ...13 total],
  "materials": ["..."],
  "optimization_notes": "...",
  "expected_grade_improvement": <number>
}`

    const result = await geminiModel.generateContent(prompt)
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const optimized = JSON.parse(text)

    // Update optimization record
    await supabase
      .from('optimization_records')
      .update({
        status: 'completed',
        optimized_title: optimized.title,
        optimized_description: optimized.description,
        optimized_tags: optimized.tags,
        optimized_materials: optimized.materials,
        grade_improvement: optimized.expected_grade_improvement,
        completed_at: new Date().toISOString(),
      })
      .eq('id', record.id)

    return res.status(200).json({ optimization_id: record.id, optimized })
  } catch (err) {
    await supabase
      .from('optimization_records')
      .update({ status: 'failed' })
      .eq('id', record.id)

    return res.status(500).json({ error: String(err) })
  }
}
