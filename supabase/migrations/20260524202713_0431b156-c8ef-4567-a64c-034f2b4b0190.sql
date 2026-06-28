-- Create beta signups table
CREATE TABLE public.beta_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.beta_signups ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their email (public signup)
CREATE POLICY "Anyone can signup for beta"
ON public.beta_signups
FOR INSERT
TO public
WITH CHECK (true);

-- Only admins can view the list
CREATE POLICY "Only admins can view beta signups"
ON public.beta_signups
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No updates or deletes allowed
CREATE POLICY "No updates on beta signups"
ON public.beta_signups
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "No deletes on beta signups"
ON public.beta_signups
FOR DELETE
TO authenticated
USING (false);