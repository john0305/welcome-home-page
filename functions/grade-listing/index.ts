/**
 * Google Cloud Function: grade-listing
 * Grades a listing using Gemini AI and stores the result.
 *
 * Expects: POST { listing_id, user_id }
 * Returns: { grade: GradingResult }
 */

import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function gradeListing(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const { listing_id, user_id } = req.body as { listing_id: string; user_id: string }
  if (!listing_id || !user_id) return res.status(400).json({ error: 'Missing required fields' })

  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listing_id)
    .eq('user_id', user_id)
    .single()

  if (fetchError || !listing) return res.status(404).json({ error: 'Listing not found' })

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const prompt = `You are an expert Etsy SEO specialist. Grade this listing for Etsy search performance.

LISTING DATA:
Title: "${listing.title}"
Description: "${listing.description.slice(0, 800)}"
Tags (${listing.tags.length}/13): ${listing.tags.join(', ')}
Materials: ${listing.materials.join(', ')}
Images: ${listing.image_urls.length}

Grade each on 0-25 scale. Respond with ONLY valid JSON:
{
  "overall_score": <sum>,
  "title_score": <0-25>,
  "description_score": <0-25>,
  "tags_score": <0-25>,
  "image_score": <0-25>,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "summary": "..."
}`

    const result = await model.generateContent(prompt)
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const grade = JSON.parse(text)

    // Save grade
    const { error: gradeError } = await supabase.from('listing_grades').insert({
      listing_id,
      ...grade,
      graded_at: new Date().toISOString(),
      graded_by: 'gemini-1.5-flash',
      views_at_grading: listing.views,
      favorites_at_grading: listing.favorites,
      sales_at_grading: listing.sales_count,
    })

    if (!gradeError) {
      await supabase
        .from('listings')
        .update({ current_grade: grade.overall_score })
        .eq('id', listing_id)
    }

    return res.status(200).json({ grade })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
