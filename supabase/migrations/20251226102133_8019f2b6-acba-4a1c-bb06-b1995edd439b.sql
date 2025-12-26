-- Add column to store AI-parsed resume data
ALTER TABLE public.candidates 
ADD COLUMN IF NOT EXISTS parsed_resume jsonb DEFAULT NULL;