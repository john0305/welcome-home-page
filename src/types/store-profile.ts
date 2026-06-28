export interface StorePersonality {
  id: string
  user_id: string
  shop_id: string

  // Brand identity
  brand_voice: string           // e.g. "warm and earthy", "minimal and modern"
  target_audience: string       // e.g. "women 25-45 who love boho style"
  style_keywords: string[]      // e.g. ["handmade", "boho", "natural", "artisan"]
  avoid_keywords: string[]      // words/phrases to never use

  // Store description
  store_description: string     // free-form description of the shop
  unique_selling_points: string // what makes this shop different
  price_positioning: 'budget' | 'mid-range' | 'premium' | 'luxury'

  // Content preferences
  tone: 'casual' | 'professional' | 'playful' | 'sophisticated' | 'earthy'
  emoji_usage: 'none' | 'minimal' | 'moderate'
  description_style: 'storytelling' | 'feature-focused' | 'benefit-focused' | 'mixed'

  // What NOT to do
  avoid_claims: string          // e.g. "Don't claim healing properties for crystals"
  competitor_mentions: 'allowed' | 'avoid'

  // Brand values / signature phrasing — freeform "value: phrasing" lines,
  // one per line. e.g.
  //   recycled: sustainably sourced from estate sales and carefully curated
  //   vintage: each piece carries its own story and history
  shop_values: string

  // Product context — what the shop primarily sells. Helps the AI ground
  // material/era/care suggestions in the right category.
  product_categories: string    // e.g. "vintage jewelry, antique brassware"
  era_focus: string             // e.g. "Victorian, Art Deco, mid-century"

  // Completion
  is_complete: boolean
  completion_percentage: number
  last_updated: string
  created_at: string
}

export interface AiFollowup {
  id: string
  question: string
  type: 'text' | 'textarea' | 'select'
  options?: string[]
  helpText?: string
  why?: string
  source: 'ai'
}

export interface PersonalityQuestion {
  id: keyof StorePersonality
  question: string
  type: 'text' | 'select' | 'multiselect' | 'textarea'
  placeholder?: string
  options?: string[]
  helpText?: string
  required: boolean
}

import type { ShopCategory } from '@/lib/detectShopCategory'

// Category-tailored examples. Each entry overrides placeholder/helpText so the
// generic question prompt adapts to what the shop actually sells.
const CATEGORY_PRESETS: Record<string, {
  store_description: string
  product_categories: string
  target_audience: string
  brand_voice: string
  unique_selling_points: string
  style_keywords: string
  avoid_keywords: string
  shop_values: string
  showEra: boolean
}> = {
  apparel: {
    store_description: 'e.g. We design original graphic tees and hoodies for music fans and activists. Each shirt is printed-to-order on soft, ethically sourced blanks from our small studio.',
    product_categories: 'e.g. graphic t-shirts, unisex hoodies, crewneck sweatshirts',
    target_audience: 'e.g. 18-35 year olds who like statement apparel, support indie artists, and prefer unisex fits over fast-fashion brands.',
    brand_voice: 'e.g. bold, witty, a little irreverent — like a band T-shirt that knows the lyrics',
    unique_selling_points: 'e.g. Original designs, printed-to-order so nothing ends up in landfill, soft-hand water-based inks, true-to-size fit guide.',
    style_keywords: 'e.g. unisex, graphic tee, soft cotton, streetwear, statement, original design',
    avoid_keywords: 'e.g. cheap, knock-off, copy, "as seen on"',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nprint-on-demand: made just for you, never overproduced\nethically printed: water-based inks on responsibly sourced blanks\ninclusive sizing: true unisex fit from XS to 4XL",
    showEra: false,
  },
  jewelry: {
    store_description: 'e.g. We curate one-of-a-kind vintage jewelry and brass treasures, sustainably sourced from estate sales. Each piece is cleaned, photographed, and shipped in recycled packaging from our small studio.',
    product_categories: 'e.g. vintage jewelry, sterling silver rings, beaded earrings',
    target_audience: 'e.g. Women 25-45 who love bohemian style, shop ethically, and appreciate handmade quality over mass-produced items.',
    brand_voice: 'e.g. warm, earthy, and approachable — like talking to a friend at a craft fair',
    unique_selling_points: 'e.g. Each piece is one-of-a-kind. I use recycled silver. I include a handwritten care card with every order.',
    style_keywords: 'e.g. handcrafted, boho, sustainable, artisan, wearable art',
    avoid_keywords: 'e.g. cheap, discount, healing properties, cures',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nrecycled: sustainably sourced from estate sales and carefully curated\nvintage: each piece carries its own story and history",
    showEra: true,
  },
  home_decor: {
    store_description: 'e.g. We design cozy, modern home decor — throw pillows, candles, and wall hangings — printed and finished in our studio.',
    product_categories: 'e.g. throw pillows, soy candles, woven wall hangings',
    target_audience: 'e.g. First-time homeowners and renters 25-40 styling cozy modern spaces on a thoughtful budget.',
    brand_voice: 'e.g. cozy, modern, calm — like a Sunday morning at home',
    unique_selling_points: 'e.g. Hand-poured soy candles, OEKO-TEX cotton covers, ships flat to keep prices fair.',
    style_keywords: 'e.g. cozy, modern, neutral, minimalist, hand-poured, OEKO-TEX',
    avoid_keywords: 'e.g. cheap, mass-produced, "as seen on Instagram"',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nsmall batch: poured and packed in small batches in our studio\nlow-tox: cotton wicks, soy wax, no phthalates",
    showEra: false,
  },
  art_print: {
    store_description: 'e.g. We sell original watercolor illustrations and giclée prints inspired by national parks. Printed on archival paper in our studio.',
    product_categories: 'e.g. giclée art prints, watercolor illustrations, framed prints',
    target_audience: 'e.g. Nature-loving 25-45 year olds decorating gallery walls and looking for meaningful, original art.',
    brand_voice: 'e.g. thoughtful, nature-led, a little nostalgic',
    unique_selling_points: 'e.g. Original illustrations (not stock), archival inks, museum-quality paper, ships flat with care.',
    style_keywords: 'e.g. original art, giclée, archival, hand-illustrated, gallery wall',
    avoid_keywords: 'e.g. AI generated, stock, generic',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\noriginal art: every print starts as a hand-painted original\narchival quality: museum-grade inks and acid-free paper",
    showEra: false,
  },
  craft_supply: {
    store_description: 'e.g. We sell hand-dyed yarns, beads, and jewelry-making findings sourced ethically and dyed in small batches.',
    product_categories: 'e.g. hand-dyed merino yarn, glass beads, brass findings',
    target_audience: 'e.g. Knitters, jewelry makers, and crafters who care about quality materials and indie suppliers.',
    brand_voice: 'e.g. knowledgeable, friendly, encouraging — like a favorite yarn shop owner',
    unique_selling_points: 'e.g. Small-batch dyed in our studio, lead/nickel free metals, fast restocks.',
    style_keywords: 'e.g. small batch, hand-dyed, indie dyer, ethically sourced',
    avoid_keywords: 'e.g. cheap, factory, bulk',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nsmall batch: dyed in our studio in batches of 10 or less\nnickel free: every finding is tested and certified",
    showEra: false,
  },
  digital: {
    store_description: 'e.g. We sell printable wall art, planner pages, and SVG bundles — instantly delivered to your inbox.',
    product_categories: 'e.g. printables, SVG cut files, planner inserts, Cricut bundles',
    target_audience: 'e.g. DIY decorators, Cricut crafters, and planner enthusiasts who want polished designs they can print at home.',
    brand_voice: 'e.g. clean, helpful, modern — like a designer friend',
    unique_selling_points: 'e.g. Includes multiple file formats, free updates, fast email support.',
    style_keywords: 'e.g. instant download, printable, SVG, Cricut, modern, minimalist',
    avoid_keywords: 'e.g. "guaranteed to work", "best ever"',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\ninstant: delivered to your inbox the moment you pay\nmulti-format: ships as PDF, PNG, SVG so it works in any software",
    showEra: false,
  },
  vintage: {
    store_description: 'e.g. We curate genuine vintage clothing, glassware, and home goods from the 1950s-90s, all cleaned and ready to love again.',
    product_categories: 'e.g. vintage denim, mid-century glassware, retro housewares',
    target_audience: 'e.g. Vintage lovers 20-45 who want one-of-one pieces with real history, not reproductions.',
    brand_voice: 'e.g. nostalgic, well-researched, a little romantic about decades past',
    unique_selling_points: 'e.g. Every piece is photographed in natural light with measurements, era is verified, and condition is honestly described.',
    style_keywords: 'e.g. true vintage, one of a kind, retro, mid-century, era-verified',
    avoid_keywords: 'e.g. reproduction, vintage-inspired, repro',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nera-verified: only listed when the era is confirmed by hallmarks or research\nhonest condition: every flaw photographed and described",
    showEra: true,
  },
  paper_goods: {
    store_description: 'e.g. We design original greeting cards, wedding invitations, and planners — letterpress-printed in our studio.',
    product_categories: 'e.g. greeting cards, wedding invitations, planners, stickers',
    target_audience: 'e.g. 25-45 year olds planning weddings, sending thoughtful mail, or buying gifts for paper-lovers.',
    brand_voice: 'e.g. warm, witty, a little crafty',
    unique_selling_points: 'e.g. Original illustrations, recycled cardstock, custom wording options.',
    style_keywords: 'e.g. letterpress, original illustration, recycled paper, hand-lettered',
    avoid_keywords: 'e.g. generic, mass-produced',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nrecycled stock: printed on 100% post-consumer recycled cardstock\nhand-lettered: every word drawn by hand before being printed",
    showEra: false,
  },
  beauty: {
    store_description: 'e.g. We make small-batch soaps, balms, and skincare with simple, food-grade ingredients in our studio kitchen.',
    product_categories: 'e.g. cold-process soap, lip balm, body scrub, beard oil',
    target_audience: 'e.g. People with sensitive skin who want simple, transparent ingredient lists they can pronounce.',
    brand_voice: 'e.g. calm, gentle, informative — like a herbalist friend',
    unique_selling_points: 'e.g. Small batch, ingredient-transparent, no synthetic fragrance.',
    style_keywords: 'e.g. small batch, cold-process, plant-based, fragrance-free, low-tox',
    avoid_keywords: 'e.g. cures, treats, medical claims, "all-natural" without specifics',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\ningredient-transparent: every ingredient listed, no proprietary blends\nsmall batch: hand-poured in batches of 20 or less",
    showEra: false,
  },
  accessories: {
    store_description: 'e.g. We design canvas tote bags and leather keychains — hand-cut, hand-sewn, and made to last in our studio.',
    product_categories: 'e.g. canvas totes, leather keychains, beanies, scarves',
    target_audience: 'e.g. People 20-40 who carry their values on their sleeve and want pieces that last for years.',
    brand_voice: 'e.g. practical, friendly, durable',
    unique_selling_points: 'e.g. Heavyweight cotton canvas, reinforced stitching, made to outlast cheap alternatives.',
    style_keywords: 'e.g. hand-sewn, heavyweight canvas, full-grain leather, made to last',
    avoid_keywords: 'e.g. cheap, fast-fashion',
    shop_values: "One per line, format 'value: how to phrase it'. e.g.\nmade to last: reinforced seams designed for daily use\nsmall batch: cut and sewn in our studio, not outsourced",
    showEra: false,
  },
}

const DEFAULT_PRESET = CATEGORY_PRESETS.jewelry

export function getPersonalityQuestions(category?: string | ShopCategory | null): PersonalityQuestion[] {
  const preset = (category && CATEGORY_PRESETS[category]) || DEFAULT_PRESET

  const base: PersonalityQuestion[] = [
    {
      id: 'store_description',
      question: "In 2–3 sentences, describe your shop as if telling a new customer about it.",
      type: 'textarea',
      placeholder: preset.store_description,
      helpText: "This becomes the foundation of how AI understands and writes about your shop.",
      required: true,
    },
    {
      id: 'product_categories',
      question: "What do you primarily sell?",
      type: 'text',
      placeholder: preset.product_categories,
      helpText: "Helps the AI ground material, care, and era suggestions in the right category.",
      required: true,
    },
  ]

  if (preset.showEra) {
    base.push({
      id: 'era_focus',
      question: "If you sell vintage or antique items, which eras do you focus on?",
      type: 'text',
      placeholder: "e.g. Victorian, Art Deco, mid-century modern, 1970s boho",
      helpText: "AI will only mention an era when verified. Leave blank if your shop isn't vintage.",
      required: false,
    })
  }

  base.push(
    {
      id: 'target_audience',
      question: "Who is your ideal customer?",
      type: 'textarea',
      placeholder: preset.target_audience,
      helpText: "The more specific, the better the AI can tailor language to resonate with your buyers.",
      required: true,
    },
    {
      id: 'brand_voice',
      question: "How would you describe your brand's personality or vibe?",
      type: 'text',
      placeholder: preset.brand_voice,
      required: true,
    },
    {
      id: 'tone',
      question: "What tone should your listing descriptions use?",
      type: 'select',
      options: ['casual', 'professional', 'playful', 'sophisticated', 'earthy'],
      required: true,
    },
    {
      id: 'unique_selling_points',
      question: "What makes your shop different from others selling similar items?",
      type: 'textarea',
      placeholder: preset.unique_selling_points,
      required: true,
    },
    {
      id: 'price_positioning',
      question: "How is your shop positioned on price?",
      type: 'select',
      options: ['budget', 'mid-range', 'premium', 'luxury'],
      helpText: "This affects how the AI describes value and quality in listings.",
      required: true,
    },
    {
      id: 'style_keywords',
      question: "What keywords or phrases feel very 'on-brand' for your shop?",
      type: 'text',
      placeholder: preset.style_keywords,
      helpText: "Comma-separated. The AI will try to weave these naturally into your content.",
      required: false,
    },
    {
      id: 'avoid_keywords',
      question: "Any words, phrases, or claims you want to AVOID in your listings?",
      type: 'text',
      placeholder: preset.avoid_keywords,
      helpText: "The AI will never use these. Great for compliance or off-brand language.",
      required: false,
    },
    {
      id: 'avoid_claims',
      question: "Any specific claims or topics the AI should stay away from?",
      type: 'textarea',
      placeholder: "e.g. Don't make health or healing claims. Don't mention competitors. Don't use before/after language.",
      required: false,
    },
    {
      id: 'shop_values',
      question: "What are your shop's core values, and how should the AI talk about them?",
      type: 'textarea',
      placeholder: preset.shop_values,
      helpText: "The AI will naturally weave these phrasings into descriptions whenever the value applies to the product.",
      required: false,
    },
    {
      id: 'emoji_usage',
      question: "Emoji usage in descriptions?",
      type: 'select',
      options: ['none', 'minimal', 'moderate'],
      required: true,
    },
    {
      id: 'description_style',
      question: "What description style works best for your buyers?",
      type: 'select',
      options: ['storytelling', 'feature-focused', 'benefit-focused', 'mixed'],
      helpText: "Storytelling: narrative flow. Feature-focused: specs and details. Benefit-focused: what it does for the buyer.",
      required: false,
    },
  )

  return base
}

// Back-compat: default (jewelry-flavored) question list for callers that
// haven't been wired up to a category yet.
export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = getPersonalityQuestions(null)

// Build the system prompt prefix that gets prepended to every Gemini call
export function buildSystemPrompt(profile: Partial<StorePersonality>): string {
  if (!profile.store_description) return ''

  const lines: string[] = [
    `SHOP CONTEXT (always keep this in mind when optimizing):`,
    `Store description: ${profile.store_description}`,
  ]

  if (profile.product_categories) lines.push(`Primary product categories: ${profile.product_categories}`)
  if (profile.era_focus) lines.push(`Era focus (only reference when verified by photos/answers): ${profile.era_focus}`)
  if (profile.target_audience) lines.push(`Target audience: ${profile.target_audience}`)
  if (profile.brand_voice) lines.push(`Brand voice: ${profile.brand_voice}`)
  if (profile.tone) lines.push(`Tone: ${profile.tone}`)
  if (profile.price_positioning) lines.push(`Price positioning: ${profile.price_positioning}`)
  if (profile.unique_selling_points) lines.push(`What makes this shop unique: ${profile.unique_selling_points}`)
  if (profile.style_keywords?.length) lines.push(`Preferred keywords/phrases: ${profile.style_keywords.join(', ')}`)
  if (profile.avoid_keywords?.length) lines.push(`NEVER use these words/phrases: ${profile.avoid_keywords.join(', ')}`)
  if (profile.avoid_claims) lines.push(`Claims/topics to avoid: ${profile.avoid_claims}`)
  if (profile.emoji_usage) lines.push(`Emoji usage: ${profile.emoji_usage}`)
  if (profile.description_style) lines.push(`Description style: ${profile.description_style}`)
  if (profile.shop_values && profile.shop_values.trim()) {
    lines.push(
      `Shop values — when a product genuinely embodies one of these values, weave the matching phrasing naturally into the description (do NOT force it if it doesn't apply):\n${profile.shop_values.trim()}`
    )
  }

  return lines.join('\n') + '\n\n'
}
