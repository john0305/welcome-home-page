INSERT INTO public.achievements (name, description, flavor_text, icon, category, points, trigger_type, trigger_condition, is_active)
VALUES (
  'Welcome Aboard',
  'You joined RadarIQ. The radar is warming up.',
  'Every great store starts with a single step. Welcome to the crew.',
  '👋',
  'getting_started',
  5,
  'organic',
  '{"metric": "account_created", "threshold": 1}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;