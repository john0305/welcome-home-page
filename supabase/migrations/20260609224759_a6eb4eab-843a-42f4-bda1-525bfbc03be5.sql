
CREATE TABLE public.fix_lifecycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id text NOT NULL,
  shop_id text NOT NULL,
  field text NOT NULL,
  issue_description text,
  suggested_fix text,
  status text NOT NULL DEFAULT 'open',
  source text,
  before_value text,
  after_value text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  last_monitored_at timestamptz,
  reopened_count int NOT NULL DEFAULT 0,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fix_lifecycle_status_chk CHECK (status IN ('open','applied','monitoring','reopened')),
  CONSTRAINT fix_lifecycle_field_chk CHECK (field IN ('title','tags','price','photos','description','quantity','shipping'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fix_lifecycle TO authenticated;
GRANT ALL ON public.fix_lifecycle TO service_role;

ALTER TABLE public.fix_lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own fix_lifecycle"
  ON public.fix_lifecycle FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX fix_lifecycle_user_status_idx ON public.fix_lifecycle(user_id, status);
CREATE INDEX fix_lifecycle_listing_field_idx ON public.fix_lifecycle(listing_id, field, status);
CREATE UNIQUE INDEX fix_lifecycle_active_unique
  ON public.fix_lifecycle(listing_id, field)
  WHERE status IN ('open','reopened');

CREATE TRIGGER update_fix_lifecycle_updated_at
  BEFORE UPDATE ON public.fix_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
