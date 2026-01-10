-- =====================================================
-- CortexHR Database Schema - Migration 004
-- Storage Configuration
-- =====================================================

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Create resumes bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STORAGE POLICIES
-- =====================================================

-- Allow authenticated HR staff to upload resumes
CREATE POLICY "HR staff can upload resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Allow authenticated HR staff to view resumes
CREATE POLICY "HR staff can view resumes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Allow authenticated HR staff to delete resumes
CREATE POLICY "HR staff can delete resumes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Allow service role (edge functions) full access
-- This is handled by service role key, no policy needed
