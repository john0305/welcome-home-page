// Shop/listing type detection — server mirror of src/lib/shopType.ts.
// Keep the two files' logic in sync; edge functions cannot import from src/.
//
// Detection prefers Etsy's own classification fields (listing_type, when_made,
// who_made, is_supply — captured by sync-listings since 2026-07) and falls
// back to token heuristics for rows synced before those columns existed.

export type ListingKind =
  | "digital" | "made_to_order" | "vintage" | "supplies"
  | "personalized" | "one_of_a_kind" | "inventory";

export interface TypedListing {
  state?: string | null;
  quantity?: number | null;
  tags?: string[] | null;
  title?: string | null;
  listing_type?: string | null;
  when_made?: string | null;
  who_made?: string | null;
  is_supply?: boolean | null;
  is_personalizable?: boolean | null;
}

const DIGITAL_TOKENS = [
  "digital download", "printable", "instant download", "svg", "pdf download",
  "png file", "cricut", "silhouette", "sublimation", "clipart",
];
const SUPPLIES_TOKENS = [
  "craft supply", "craft supplies", "beads", "jewelry findings", "fabric by the yard",
  "yarn", "cabochon", "destash", "wholesale", "bulk", "lot of",
];
const PERSONALIZED_TOKENS = [
  "personalized", "personalised", "custom", "customized", "monogram",
  "made to order", "made-to-order", "your name", "your photo",
];

function hasToken(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase();
  return tokens.some((tok) => t.includes(tok));
}

function isVintageWhenMade(whenMade: string | null | undefined): boolean {
  if (!whenMade || whenMade === "made_to_order") return false;
  const m = whenMade.match(/^(\d{4})/);
  if (m) return Number(m[1]) < 2006;
  const decade = whenMade.match(/^(\d{4})s$/);
  if (decade) return Number(decade[1]) < 2006;
  return whenMade.startsWith("before_");
}

export function classifyListing(l: TypedListing): ListingKind {
  const blob = `${l.title ?? ""} ${(l.tags ?? []).join(" ")}`;

  if (l.listing_type === "download") return "digital";
  if (l.is_supply === true) return "supplies";
  if (isVintageWhenMade(l.when_made)) return "vintage";
  if (l.when_made === "made_to_order") {
    return l.is_personalizable === true ? "personalized" : "made_to_order";
  }

  if (hasToken(blob, DIGITAL_TOKENS)) return "digital";
  if (hasToken(blob, SUPPLIES_TOKENS)) return "supplies";
  if (hasToken(l.title ?? "", PERSONALIZED_TOKENS)) return "personalized";
  const qty = l.quantity ?? 0;
  if (qty > 1) return "inventory";
  return "one_of_a_kind";
}

export interface ShopTypeProfile {
  type: ListingKind;
  confidence: number;
  breakdown: Record<ListingKind, number>;
  totalActive: number;
}

export function deriveShopTypeProfile(listings: TypedListing[]): ShopTypeProfile {
  const active = listings.filter((l) => (l.state ?? "active") === "active");
  const breakdown: Record<ListingKind, number> = {
    digital: 0, made_to_order: 0, vintage: 0, supplies: 0,
    personalized: 0, one_of_a_kind: 0, inventory: 0,
  };
  for (const l of active) breakdown[classifyListing(l)]++;

  const n = active.length;
  if (n === 0) return { type: "one_of_a_kind", confidence: 0, breakdown, totalActive: 0 };

  const entries = Object.entries(breakdown) as [ListingKind, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topKind, topCount] = entries[0];
  return { type: topKind, confidence: topCount / n, breakdown, totalActive: n };
}

/**
 * Recompute and persist the shop-type profile for a user.
 * Never overwrites a seller's manual override (shop_type_override).
 */
export async function persistShopTypeProfile(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<ShopTypeProfile | null> {
  const { data: listings } = await supabase
    .from("listings")
    .select("state, quantity, tags, title, listing_type, when_made, who_made, is_supply, is_personalizable")
    .eq("user_id", userId)
    .eq("state", "active")
    .limit(2000);
  if (!listings || listings.length === 0) return null;

  const profile = deriveShopTypeProfile(listings as TypedListing[]);

  const { error } = await supabase
    .from("user_niche_profiles")
    .upsert({
      user_id: userId,
      shop_type: profile.type,
      shop_type_confidence: Math.round(profile.confidence * 100) / 100,
      shop_type_breakdown: profile.breakdown,
      last_updated: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) console.error("persistShopTypeProfile failed", userId, error.message);
  return profile;
}
