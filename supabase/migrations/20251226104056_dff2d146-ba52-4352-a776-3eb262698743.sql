-- Add LinkedIn URL column to candidates table (GitHub and portfolio already added)
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;