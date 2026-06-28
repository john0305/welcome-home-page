ALTER TABLE public.fix_actions
  ADD COLUMN IF NOT EXISTS estimated_effort TEXT NOT NULL DEFAULT 'medium'
  CHECK (estimated_effort IN ('low','medium','high'));

UPDATE public.fix_actions SET estimated_effort = 'low'
  WHERE factor_key IN ('tags_complete','tag_coverage','materials_present');
UPDATE public.fix_actions SET estimated_effort = 'medium'
  WHERE factor_key IN ('title_strength','title_length','photo_count');
UPDATE public.fix_actions SET estimated_effort = 'high'
  WHERE factor_key IN ('description_quality','description_length','video_present');