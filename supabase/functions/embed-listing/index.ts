// Generates a semantic embedding for a listing (or batch) and stores it in
// public.listing_embeddings. Powers "similar listings" and recommendations.
//
// POST body:
//   { listing_id: string }            — embed a single listing
//   { backfill: true, limit?: number } — embed all of the caller's listings
//                                         that are missing/stale
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
const MODEL = "google/gemini-embedding-001";
const DIMS = 1536; // must match the vector(1536) column

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await supabaseAuth.auth.getUser();
  if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userRes.user.id;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { listing_id?: string; backfill?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  // Pick listings to embed
  let q = supabase.from("listings")
    .select("id, user_id, title, description, tags, materials")
    .eq("user_id", userId);
  if (body.listing_id) q = q.eq("id", body.listing_id);
  else if (body.backfill) q = q.limit(Math.min(body.limit ?? 100, 500));
  else return json({ error: "Provide listing_id or backfill:true" }, 400);

  const { data: listings, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!listings?.length) return json({ embedded: 0, message: "no listings" });

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
  for (const l of listings) {
    try {
      const doc = buildDocument(l);
      const hash = await sha256(doc);

      // Skip if already up-to-date
      if (body.backfill) {
        const { data: existing } = await supabase.from("listing_embeddings")
          .select("content_hash").eq("listing_id", l.id).maybeSingle();
        if (existing?.content_hash === hash) {
          results.push({ id: l.id, ok: true, reason: "unchanged" });
          continue;
        }
      }

      const embedding = await embed(doc, LOVABLE_API_KEY);
      const { error: upErr } = await supabase.from("listing_embeddings").upsert({
        listing_id: l.id,
        user_id: l.user_id,
        embedding,
        content_hash: hash,
        model: MODEL,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;
      results.push({ id: l.id, ok: true });
    } catch (e) {
      console.error("embed failed", l.id, e);
      results.push({ id: l.id, ok: false, reason: String(e) });
    }
    // gentle pacing to avoid bursting the gateway on backfills
    if (body.backfill) await new Promise((r) => setTimeout(r, 150));
  }

  return json({
    embedded: results.filter((r) => r.ok && r.reason !== "unchanged").length,
    unchanged: results.filter((r) => r.reason === "unchanged").length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

function buildDocument(l: {
  title: string; description: string | null;
  tags: string[]; materials: string[];
}): string {
  const tags = (l.tags ?? []).join(", ");
  const mats = (l.materials ?? []).join(", ");
  return [
    `Title: ${l.title}`,
    l.description ? `Description: ${l.description}` : "",
    tags ? `Tags: ${tags}` : "",
    mats ? `Materials: ${mats}` : "",
  ].filter(Boolean).join("\n");
}

async function embed(input: string, apiKey: string): Promise<number[]> {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMS }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gateway ${r.status}: ${t}`);
  }
  const j = await r.json();
  const vec = j?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== DIMS) {
    throw new Error(`Bad embedding (len=${vec?.length})`);
  }
  return vec;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
