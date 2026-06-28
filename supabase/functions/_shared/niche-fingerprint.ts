/**
 * Niche fingerprint: a stable, normalized key derived from a listing's tags
 * used for cross-user cache lookups.
 *
 * Decision: tag-only (no category id). Top 5 tags after normalization,
 * sorted alphabetically, joined with "|".
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "to", "in", "on", "by",
  "from", "at", "is", "it", "your", "you", "my", "our", "this", "that",
]);

export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")        // strip diacritics
    .replace(/[^a-z0-9\s-]/g, " ")          // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTagFingerprint(tags: string[] | null | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const t of tags) {
    if (!t) continue;
    const n = normalizeTag(t);
    if (!n || STOPWORDS.has(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    cleaned.push(n);
  }
  if (cleaned.length === 0) return null;
  const top = cleaned.slice(0, 5).sort();
  return top.join("|");
}
