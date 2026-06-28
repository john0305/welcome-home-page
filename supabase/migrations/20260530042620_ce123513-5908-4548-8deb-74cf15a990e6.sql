-- Enable pgvector for semantic search & recommendations
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table (1536-dim to stay within pgvector's HNSW limit; we truncate Gemini's 3072 via the `dimensions` param)
CREATE TABLE IF NOT EXISTS public.listing_embeddings (
  listing_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  embedding vector(1536) NOT NULL,
  content_hash text NOT NULL,
  model text NOT NULL DEFAULT 'google/gemini-embedding-001',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listing_embeddings TO authenticated;
GRANT ALL ON public.listing_embeddings TO service_role;

ALTER TABLE public.listing_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_embeddings_owner_select" ON public.listing_embeddings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "listing_embeddings_admin_all" ON public.listing_embeddings
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE INDEX IF NOT EXISTS listing_embeddings_hnsw_idx
  ON public.listing_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS listing_embeddings_user_idx
  ON public.listing_embeddings (user_id);

-- Similarity search RPC: returns peers of a given listing, scoped to caller
CREATE OR REPLACE FUNCTION public.match_similar_listings(
  _listing_id uuid,
  _match_count int DEFAULT 8
)
RETURNS TABLE (
  listing_id uuid,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (
    SELECT embedding, user_id FROM public.listing_embeddings WHERE listing_id = _listing_id
  )
  SELECT le.listing_id,
         1 - (le.embedding <=> q.embedding) AS similarity
  FROM public.listing_embeddings le, q
  WHERE le.user_id = q.user_id
    AND le.listing_id <> _listing_id
    AND le.user_id = auth.uid()
  ORDER BY le.embedding <=> q.embedding
  LIMIT _match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_similar_listings(uuid, int) TO authenticated;

-- Optimization performance feedback view: shows lift on optimized listings
CREATE OR REPLACE VIEW public.v_optimization_performance AS
SELECT
  pa.user_id,
  pa.window_days,
  COUNT(*) AS sample_size,
  ROUND(AVG(pa.views_pct)::numeric, 1) AS avg_views_lift_pct,
  ROUND(AVG(pa.favorites_pct)::numeric, 1) AS avg_favorites_lift_pct,
  ROUND(AVG(pa.sales_pct)::numeric, 1) AS avg_sales_lift_pct,
  ROUND(AVG(pa.score_delta)::numeric, 1) AS avg_score_delta,
  COUNT(*) FILTER (WHERE pa.views_pct > 0) AS positive_views_count,
  COUNT(*) FILTER (WHERE pa.sales_pct > 0) AS positive_sales_count
FROM public.performance_attribution pa
WHERE pa.is_sufficient_data = true
  AND pa.is_anomaly = false
  AND pa.admin_review_status <> 'invalid'
GROUP BY pa.user_id, pa.window_days;

GRANT SELECT ON public.v_optimization_performance TO authenticated;