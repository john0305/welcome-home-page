// Detects placeholder/fill-in-later text that AI optimizations must never emit.
// Sellers reject (not edit) optimizations, so any unfinished text is dead weight.

const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // Bracketed/braced/angle-bracketed slots: [insert X], {brand}, <measurement>
  { re: /\[[^\]\n]{1,80}\]/, label: "square-bracket placeholder" },
  { re: /\{[^}\n]{1,80}\}/, label: "curly-brace placeholder" },
  { re: /<[^>\n]{1,80}>/, label: "angle-bracket placeholder" },
  // Standalone placeholder tokens
  { re: /\b(TBD|TODO|FIXME|XXX|N\/A|lorem ipsum|placeholder)\b/i, label: "placeholder keyword" },
  // Instructional phrases that mean "seller, fill this in"
  { re: /\b(insert|add|enter|fill in|your)\s+[a-z][a-z\s]{0,40}\s+(here|below|above)\b/i, label: "fill-in instruction" },
  { re: /\bfill in\b/i, label: "fill-in instruction" },
  // Parenthetical fill-ins like "(your measurement)" / "(insert brand)"
  { re: /\((?:insert|add|enter|your|describe|measurement|brand|material)\b[^)\n]{0,60}\)/i, label: "parenthetical placeholder" },
];

export type PlaceholderHit = { field: string; pattern: string; sample: string };

export function findPlaceholders(fields: Record<string, string | string[] | undefined | null>): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const texts = Array.isArray(value) ? value : value ? [value] : [];
    for (const text of texts) {
      if (!text) continue;
      for (const { re, label } of PLACEHOLDER_PATTERNS) {
        const m = text.match(re);
        if (m) {
          hits.push({ field, pattern: label, sample: m[0].slice(0, 80) });
          break;
        }
      }
    }
  }
  return hits;
}

export const NO_PLACEHOLDER_PROMPT_RULES = `ABSOLUTE NO-PLACEHOLDER RULES:
- The seller will NOT edit your output before publishing — they will only accept or reject. Anything unfinished gets rejected.
- NEVER emit bracketed slots of any kind: no [brackets], {braces}, or <angle brackets> in the final text. Not for hooks, not for sections, not anywhere.
- NEVER write TBD, TODO, FIXME, XXX, N/A, "lorem ipsum", or the word "placeholder".
- NEVER write instructions to the seller like "insert measurement here", "add your brand", "fill in", "enter dimensions", "your story here", "(your X)", "(insert X)".
- If you do not have a specific fact (measurement, brand, era, material), OMIT that line or that whole section entirely. Do not leave a slot for the seller to fill.
- Every sentence, bullet, tag, and material in your output must be final, publishable text that could ship to Etsy unchanged.`;
