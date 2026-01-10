-- =====================================================
-- CortexHR Complete Database Schema
-- Single file for easy deployment to new Supabase project
-- =====================================================
-- 
-- INSTRUCTIONS:
-- 1. Replace YOUR_PROJECT_URL with your Supabase project URL
--    Example: https://abcdefghijk.supabase.co
-- 2. Replace YOUR_ANON_KEY with your Supabase anon/public key
-- 3. Run this entire file in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- =====================================================
-- PART 2: TYPES/ENUMS
-- =====================================================

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'applied',
    'screening', 
    'interview',
    'offer',
    'hired',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM (
    'admin',
    'recruiter',
    'hr_manager'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PART 3: TABLES
-- =====================================================

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User role assignments
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Job postings
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Full-time',
  description TEXT,
  requirements TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_hr_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidates
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  resume_url TEXT,
  resume_text TEXT,
  parsed_resume JSONB,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  portfolio_analysis JSONB,
  access_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Applications
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  ai_score INTEGER,
  ai_skills JSONB,
  ai_summary TEXT,
  aptitude_score INTEGER,
  aptitude_completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Interviews
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  interview_type TEXT NOT NULL DEFAULT 'Technical',
  meeting_url TEXT,
  meeting_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offer letters
CREATE TABLE IF NOT EXISTS public.offer_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  position_title TEXT NOT NULL,
  department TEXT NOT NULL,
  work_location TEXT NOT NULL,
  salary_amount NUMERIC NOT NULL,
  salary_currency TEXT NOT NULL DEFAULT 'USD',
  salary_frequency TEXT NOT NULL DEFAULT 'yearly',
  proposed_start_date DATE NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  remote_policy TEXT,
  reporting_manager TEXT,
  benefits_package TEXT,
  equity_details TEXT,
  bonus_structure TEXT,
  vacation_days INTEGER,
  sick_leave_days INTEGER,
  probation_period_months INTEGER DEFAULT 3,
  notice_period_days INTEGER DEFAULT 30,
  offer_expiry_date DATE,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aptitude questions
CREATE TABLE IF NOT EXISTS public.aptitude_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aptitude answers
CREATE TABLE IF NOT EXISTS public.aptitude_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.aptitude_questions(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google OAuth tokens for HR staff
CREATE TABLE IF NOT EXISTS public.hr_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- PART 4: INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON public.applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_ai_score ON public.applications(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON public.candidates(email);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON public.jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON public.interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- =====================================================
-- PART 5: ENABLE RLS
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aptitude_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aptitude_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_google_tokens ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 6: HELPER FUNCTIONS
-- =====================================================

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Check if user is HR staff (has any role)
CREATE OR REPLACE FUNCTION public.is_hr_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- =====================================================
-- PART 7: RLS POLICIES
-- =====================================================

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "HR staff can view all profiles" ON public.profiles FOR SELECT USING (is_hr_staff(auth.uid()));

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recruiter role during signup" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'recruiter');
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Jobs policies
CREATE POLICY "Anyone can view active jobs" ON public.jobs FOR SELECT USING (is_active = true);
CREATE POLICY "HR staff can view assigned jobs" ON public.jobs FOR SELECT USING (is_hr_staff(auth.uid()) AND (assigned_hr_id IS NULL OR assigned_hr_id = auth.uid()));
CREATE POLICY "HR staff can manage jobs" ON public.jobs FOR ALL USING (is_hr_staff(auth.uid()));

-- Candidates policies
CREATE POLICY "Public can insert candidates" ON public.candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can check own email" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "HR staff can view candidates" ON public.candidates FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can manage candidates" ON public.candidates FOR ALL USING (is_hr_staff(auth.uid()));
CREATE POLICY "Candidates can view own data via token" ON public.candidates FOR SELECT USING (true);

-- Applications policies
CREATE POLICY "Public can insert applications" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "HR staff can view assigned applications" ON public.applications FOR SELECT USING (
  is_hr_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = applications.job_id 
    AND (jobs.assigned_hr_id IS NULL OR jobs.assigned_hr_id = auth.uid())
  )
);
CREATE POLICY "HR staff can manage assigned applications" ON public.applications FOR ALL USING (
  is_hr_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = applications.job_id 
    AND (jobs.assigned_hr_id IS NULL OR jobs.assigned_hr_id = auth.uid())
  )
);

-- Interviews policies
CREATE POLICY "HR staff can view interviews" ON public.interviews FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can manage interviews" ON public.interviews FOR ALL USING (is_hr_staff(auth.uid()));

-- Offer letters policies
CREATE POLICY "HR staff can view offer letters" ON public.offer_letters FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can manage offer letters" ON public.offer_letters FOR ALL USING (is_hr_staff(auth.uid()));

-- Email templates policies
CREATE POLICY "HR staff can view email templates" ON public.email_templates FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can manage email templates" ON public.email_templates FOR ALL USING (is_hr_staff(auth.uid()));

-- Email logs policies
CREATE POLICY "HR staff can view email logs" ON public.email_logs FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can create email logs" ON public.email_logs FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));

-- Aptitude questions policies
CREATE POLICY "Anyone can view active aptitude questions" ON public.aptitude_questions FOR SELECT USING (is_active = true);
CREATE POLICY "HR staff can manage aptitude questions" ON public.aptitude_questions FOR ALL USING (is_hr_staff(auth.uid()));

-- Aptitude answers policies
CREATE POLICY "Anyone can insert aptitude answers" ON public.aptitude_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "HR staff can view aptitude answers" ON public.aptitude_answers FOR SELECT USING (is_hr_staff(auth.uid()));

-- HR Google tokens policies
CREATE POLICY "Users can manage own tokens" ON public.hr_google_tokens FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- PART 8: UTILITY FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- PART 9: AUTH TRIGGERS
-- =====================================================

-- Create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Assign default role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'recruiter');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_role_created ON auth.users;
CREATE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- =====================================================
-- PART 10: AUTO-PROCESSING TRIGGER
-- =====================================================
-- !! IMPORTANT: Replace YOUR_PROJECT_URL and YOUR_ANON_KEY below !!

CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Make async HTTP POST to the edge function using pg_net
  PERFORM net.http_post(
    url := 'YOUR_PROJECT_URL/functions/v1/auto-process-application',
    body := jsonb_build_object('applicationId', NEW.id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_ANON_KEY'
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Auto-process trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_created ON public.applications;
CREATE TRIGGER on_application_created
  AFTER INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_process_application();

-- =====================================================
-- PART 11: OFFER LETTER AUTO-CREATE
-- =====================================================

CREATE OR REPLACE FUNCTION public.auto_create_offer_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_record RECORD;
  existing_offer UUID;
BEGIN
  IF NEW.status = 'offer' AND (OLD.status IS NULL OR OLD.status <> 'offer') THEN
    SELECT id INTO existing_offer FROM offer_letters WHERE application_id = NEW.id;
    
    IF existing_offer IS NULL THEN
      SELECT title, department, location INTO job_record
      FROM jobs WHERE id = NEW.job_id;
      
      INSERT INTO offer_letters (
        application_id, position_title, department, work_location,
        salary_amount, salary_currency, salary_frequency, proposed_start_date, status
      ) VALUES (
        NEW.id, job_record.title, job_record.department, job_record.location,
        0, 'USD', 'yearly', CURRENT_DATE + INTERVAL '14 days', 'draft'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_status_change ON public.applications;
CREATE TRIGGER on_application_status_change
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_offer_draft();

-- =====================================================
-- PART 12: UPDATED_AT TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_candidates_updated_at ON public.candidates;
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_interviews_updated_at ON public.interviews;
CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_offer_letters_updated_at ON public.offer_letters;
CREATE TRIGGER update_offer_letters_updated_at BEFORE UPDATE ON public.offer_letters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_aptitude_questions_updated_at ON public.aptitude_questions;
CREATE TRIGGER update_aptitude_questions_updated_at BEFORE UPDATE ON public.aptitude_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hr_google_tokens_updated_at ON public.hr_google_tokens;
CREATE TRIGGER update_hr_google_tokens_updated_at BEFORE UPDATE ON public.hr_google_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- PART 13: STORAGE
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', false, 10485760, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  -- HR can upload
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'HR staff can upload resumes') THEN
    CREATE POLICY "HR staff can upload resumes" ON storage.objects FOR INSERT 
    WITH CHECK (bucket_id = 'resumes' AND (SELECT is_hr_staff(auth.uid())));
  END IF;
  
  -- HR can read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'HR staff can read resumes') THEN
    CREATE POLICY "HR staff can read resumes" ON storage.objects FOR SELECT
    USING (bucket_id = 'resumes' AND (SELECT is_hr_staff(auth.uid())));
  END IF;
  
  -- HR can delete
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'HR staff can delete resumes') THEN
    CREATE POLICY "HR staff can delete resumes" ON storage.objects FOR DELETE
    USING (bucket_id = 'resumes' AND (SELECT is_hr_staff(auth.uid())));
  END IF;
  
  -- Service role full access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role has full access to resumes') THEN
    CREATE POLICY "Service role has full access to resumes" ON storage.objects FOR ALL
    USING (bucket_id = 'resumes' AND auth.role() = 'service_role');
  END IF;
END $$;

-- =====================================================
-- PART 14: SEED DATA (OPTIONAL)
-- =====================================================

-- Sample jobs
INSERT INTO public.jobs (title, department, location, job_type, description, requirements, is_active)
VALUES 
  ('Senior Software Engineer', 'Engineering', 'Remote', 'Full-time', 
   'We are looking for a Senior Software Engineer to join our growing team.',
   'Required: 5+ years of experience in software development, proficiency in React/TypeScript',
   true),
  ('Product Manager', 'Product', 'New York, NY', 'Full-time',
   'We are seeking an experienced Product Manager to lead product initiatives.',
   'Required: 3+ years of product management experience, strong analytical skills',
   true),
  ('UX Designer', 'Design', 'San Francisco, CA', 'Full-time',
   'Join our design team to create beautiful and intuitive user experiences.',
   'Required: 3+ years of UX design experience, proficiency in Figma',
   true)
ON CONFLICT DO NOTHING;

-- Sample aptitude questions
INSERT INTO public.aptitude_questions (question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty)
VALUES
  ('What is the time complexity of binary search?', 'O(n)', 'O(log n)', 'O(n²)', 'O(1)', 'B', 'algorithms', 'medium'),
  ('Which data structure uses LIFO?', 'Queue', 'Stack', 'Linked List', 'Tree', 'B', 'data_structures', 'easy'),
  ('What does REST stand for?', 'Representational State Transfer', 'Remote State Transfer', 'Realtime State Transfer', 'Reliable State Transfer', 'A', 'general', 'easy')
ON CONFLICT DO NOTHING;

-- Sample email templates
INSERT INTO public.email_templates (name, email_type, subject, body, is_default)
VALUES
  ('Interview Invitation', 'interview_invite', 'Interview Invitation - {{position}} at {{company}}',
   'Dear {{candidate_name}},\n\nWe are pleased to invite you for an interview for the {{position}} position.\n\nBest regards,\n{{company}}', true),
  ('Rejection Letter', 'rejection', 'Update on Your Application - {{company}}',
   'Dear {{candidate_name}},\n\nThank you for your interest in the {{position}} position. Unfortunately, we have decided to move forward with other candidates.\n\nBest regards,\n{{company}}', true),
  ('Offer Letter', 'offer', 'Job Offer - {{position}} at {{company}}',
   'Dear {{candidate_name}},\n\nWe are thrilled to offer you the {{position}} position at {{company}}!\n\nBest regards,\n{{company}}', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- Remember to:
-- 1. Replace YOUR_PROJECT_URL in trigger_auto_process_application
-- 2. Replace YOUR_ANON_KEY in trigger_auto_process_application
-- 3. Deploy edge functions from supabase/functions/
-- 4. Set OPENAI_API_KEY or openAI secret in Edge Functions → Secrets
-- =====================================================
