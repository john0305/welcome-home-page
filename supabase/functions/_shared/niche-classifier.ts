/**
 * Niche classifier — determines a user's primary niche.
 *
 * Priority order:
 *   1. store_personalization.category (highest confidence — human-confirmed)
 *   2. AI-inferred from listing tags (medium confidence)
 *   3. Flagged as unknown (confidence < 0.3) → admin assigns manually
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chatCompletion } from "./ai-dispatch.ts";

export interface NicheProfile {
  primary_niche: string;
  secondary_niches: string[];
  keyword_clusters: string[];
  niche_source: "personalization_form" | "tag_inference" | "admin_assigned" | "combined";
  niche_confidence: number;
  personalization_category: string | null;
  tag_inference_niche: string | null;
  niches_conflict: boolean;
  target_customer: string | null;
  price_range: string | null;
  seller_goals: string[] | null;
}

/** Maps store_personalization.category to niche key + default search clusters. */
const CATEGORY_TO_NICHE: Record<string, { niche_key: string; clusters: string[] }> = {
  jewelry: {
    niche_key: "jewelry",
    clusters: ["handmade jewelry gift", "handcrafted earrings", "sterling silver necklace"],
  },
  beauty: {
    niche_key: "handmade_bath_beauty",
    clusters: ["handmade bath bomb gift set", "natural fizzy bath bomb", "artisan soap gift"],
  },
  vintage: {
    niche_key: "vintage",
    clusters: ["vintage jewelry find", "vintage home decor", "mid century vintage piece"],
  },
  home_decor: {
    niche_key: "home_decor",
    clusters: ["handmade home decor", "boho wall hanging", "modern home accent"],
  },
  art_print: {
    niche_key: "art_prints",
    clusters: ["original art print", "watercolor wall art", "gallery wall print"],
  },
  craft_supply: {
    niche_key: "craft_supplies",
    clusters: ["craft supply bundle", "handmade beads jewelry making", "yarn fiber art"],
  },
  digital: {
    niche_key: "digital_downloads",
    clusters: ["printable wall art", "SVG cut file Cricut", "digital planner insert"],
  },
  paper_goods: {
    niche_key: "paper_party",
    clusters: ["handmade greeting card", "wedding invitation suite", "custom sticker sheet"],
  },
  apparel: {
    niche_key: "clothing_accessories",
    clusters: ["handmade graphic tee", "custom embroidered shirt", "original design sweatshirt"],
  },
  accessories: {
    niche_key: "accessories",
    clusters: ["handmade tote bag canvas", "leather keychain handmade", "custom beanie hat"],
  },
};

/** Generates keyword clusters for a niche using AI, enriched with personalization data. */
async function generateClusters(
  nicheKey: string,
  personalization: {
    product_categories?: string;
    target_audience?: string;
    price_positioning?: string;
  },
  userId: string,
): Promise<string[]> {
  const base = CATEGORY_TO_NICHE[nicheKey]?.clusters;
  if (base && base.length >= 3) return base;

  const prompt = `Generate 3 Etsy search query strings for a seller in the "${nicheKey}" niche.
${personalization.product_categories ? `Product categories: ${personalization.product_categories}` : ""}
${personalization.target_audience ? `Target audience: ${personalization.target_audience}` : ""}
${personalization.price_positioning ? `Price positioning: ${personalization.price_positioning}` : ""}

Return ONLY a JSON object: {"clusters": ["query 1", "query 2", "query 3"]}
Each query should be 3-5 words. Make them specific to what buyers actually search for on Etsy.`;

  try {
    const result = await chatCompletion({
      taskKey: "niche_classification",
      messages: [{ role: "user", content: prompt }],
      userId,
      maxTokens: 200,
    });
    const parsed = JSON.parse(result.content) as { clusters?: string[] };
    if (Array.isArray(parsed.clusters) && parsed.clusters.length > 0) {
      return parsed.clusters.slice(0, 3);
    }
  } catch {
    // Fall through to defaults
  }

  return base ?? [`${nicheKey} handmade`, `${nicheKey} gift set`, `artisan ${nicheKey}`];
}

/** Infer niche from listing tags using AI. */
async function classifyFromTags(
  tags: string[],
  userId: string,
): Promise<{ niche_key: string; confidence: number } | null> {
  if (tags.length === 0) return null;

  const uniqueTags = [...new Set(tags)].slice(0, 30);
  const prompt = `A seller on Etsy uses these tags across their listings: ${uniqueTags.join(", ")}

Classify their primary niche into ONE of these categories:
jewelry, beauty, vintage, home_decor, art_print, craft_supply, digital, paper_goods, apparel, accessories

Return ONLY a JSON object: {"niche": "category_key", "confidence": 0.0-1.0}
Where confidence reflects how certain you are based on the tag evidence.`;

  try {
    const result = await chatCompletion({
      taskKey: "niche_classification",
      messages: [{ role: "user", content: prompt }],
      userId,
      maxTokens: 100,
    });
    const parsed = JSON.parse(result.content) as { niche?: string; confidence?: number };
    if (parsed.niche && CATEGORY_TO_NICHE[parsed.niche]) {
      return { niche_key: parsed.niche, confidence: Number(parsed.confidence ?? 0.5) };
    }
  } catch {
    // Fall through to null
  }
  return null;
}

/**
 * Main entry point. Classifies user niche from personalization form first,
 * falls back to tag inference. Returns a full NicheProfile ready to upsert
 * into user_niche_profiles.
 */
export async function classifyUserNiche(
  supabase: SupabaseClient,
  userId: string,
): Promise<NicheProfile> {
  // Step 1: personalization form (highest confidence)
  const { data: personRow } = await supabase
    .from("store_personalization")
    .select("category, answers")
    .eq("user_id", userId)
    .order("completion_percentage", { ascending: false })
    .limit(1)
    .maybeSingle();

  const category = personRow?.category as string | null;
  const answers = (personRow?.answers ?? {}) as Record<string, unknown>;

  if (category && CATEGORY_TO_NICHE[category]) {
    const mapped = CATEGORY_TO_NICHE[category];
    const clusters = await generateClusters(
      category,
      {
        product_categories: answers.product_categories as string | undefined,
        target_audience: answers.target_audience as string | undefined,
        price_positioning: answers.price_positioning as string | undefined,
      },
      userId,
    );

    return {
      primary_niche: mapped.niche_key,
      secondary_niches: [],
      keyword_clusters: clusters,
      niche_source: "personalization_form",
      niche_confidence: 0.95,
      personalization_category: category,
      tag_inference_niche: null,
      niches_conflict: false,
      target_customer: (answers.target_audience as string | null) ?? null,
      price_range: (answers.price_positioning as string | null) ?? null,
      seller_goals: null,
    };
  }

  // Step 2: tag inference fallback
  const { data: listings } = await supabase
    .from("listings")
    .select("tags")
    .eq("user_id", userId)
    .eq("state", "active")
    .limit(50);

  const allTags = (listings ?? []).flatMap((l: { tags: string[] }) => l.tags ?? []);

  if (allTags.length > 0) {
    const inferred = await classifyFromTags(allTags, userId);

    if (inferred && inferred.confidence >= 0.3) {
      const mapped = CATEGORY_TO_NICHE[inferred.niche_key];
      const clusters = await generateClusters(inferred.niche_key, {}, userId);

      // Check for conflict with any existing personalization
      const nicheConflict = !!category && category !== inferred.niche_key;

      return {
        primary_niche: mapped.niche_key,
        secondary_niches: [],
        keyword_clusters: clusters,
        niche_source: "tag_inference",
        niche_confidence: inferred.confidence,
        personalization_category: category,
        tag_inference_niche: inferred.niche_key,
        niches_conflict: nicheConflict,
        target_customer: (answers.target_audience as string | null) ?? null,
        price_range: (answers.price_positioning as string | null) ?? null,
        seller_goals: null,
      };
    }
  }

  // Step 3: unknown — flag for admin review
  return {
    primary_niche: "unknown",
    secondary_niches: [],
    keyword_clusters: [],
    niche_source: "tag_inference",
    niche_confidence: 0.1,
    personalization_category: category,
    tag_inference_niche: null,
    niches_conflict: false,
    target_customer: null,
    price_range: null,
    seller_goals: null,
  };
}

/** Saves niche profile to user_niche_profiles. Upserts on user_id. */
export async function saveNicheProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: NicheProfile,
): Promise<void> {
  await supabase.from("user_niche_profiles").upsert({
    user_id: userId,
    ...profile,
    last_updated: new Date().toISOString(),
  }, { onConflict: "user_id" });
}
