
CREATE OR REPLACE FUNCTION public.decode_html_entities(s text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  out text := s;
  m text;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  -- numeric decimal entities
  FOR m IN SELECT DISTINCT (regexp_matches(out, '&#(\d+);', 'g'))[1] LOOP
    out := replace(out, '&#' || m || ';', chr(m::int));
  END LOOP;
  -- numeric hex entities
  FOR m IN SELECT DISTINCT (regexp_matches(out, '&#x([0-9a-fA-F]+);', 'g'))[1] LOOP
    out := replace(out, '&#x' || m || ';', chr(('x' || m)::bit(32)::int));
  END LOOP;
  out := replace(out, '&quot;', '"');
  out := replace(out, '&apos;', '''');
  out := replace(out, '&lt;', '<');
  out := replace(out, '&gt;', '>');
  out := replace(out, '&nbsp;', ' ');
  out := replace(out, '&amp;', '&');
  RETURN out;
END $$;

UPDATE public.listings
SET title = public.decode_html_entities(title)
WHERE title ~ '&(#\d+|#x[0-9a-fA-F]+|amp|quot|apos|lt|gt|nbsp);';

UPDATE public.listings
SET description = public.decode_html_entities(description)
WHERE description ~ '&(#\d+|#x[0-9a-fA-F]+|amp|quot|apos|lt|gt|nbsp);';

DROP FUNCTION public.decode_html_entities(text);
