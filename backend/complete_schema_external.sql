-- =====================================================
-- CortexHR - Complete External Deployment Schema
-- Version: 1.0.0
-- 
-- INSTRUCTIONS:
-- 1. Replace YOUR_PROJECT_URL with your Supabase URL (e.g., https://abc123.supabase.co)
-- 2. Replace YOUR_ANON_KEY with your Supabase anon/public key
-- 3. Run this entire file in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =====================================================
-- CUSTOM TYPES
-- =====================================================
DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'recruiter', 'hr_manager');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLES
-- =====================================================

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- User roles table (separate from profiles for security)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id, role)
);

-- Jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  job_type TEXT DEFAULT 'full-time' NOT NULL,
  description TEXT,
  requirements TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  assigned_hr_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Candidates table
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  resume_url TEXT,
  resume_text TEXT,
  parsed_resume JSONB,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  portfolio_analysis JSONB,
  access_token TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Applications table
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status application_status DEFAULT 'applied' NOT NULL,
  ai_score INTEGER,
  ai_summary TEXT,
  ai_skills JSONB,
  aptitude_score INTEGER,
  aptitude_completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(candidate_id, job_id)
);

-- Interviews table
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60 NOT NULL,
  interview_type TEXT DEFAULT 'video' NOT NULL,
  meeting_url TEXT,
  meeting_id TEXT,
  status TEXT DEFAULT 'scheduled' NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Offer letters table
CREATE TABLE IF NOT EXISTS public.offer_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  position_title TEXT NOT NULL,
  department TEXT NOT NULL,
  salary_amount NUMERIC NOT NULL,
  salary_currency TEXT DEFAULT 'USD' NOT NULL,
  salary_frequency TEXT DEFAULT 'yearly' NOT NULL,
  proposed_start_date DATE NOT NULL,
  work_location TEXT NOT NULL,
  employment_type TEXT DEFAULT 'full-time' NOT NULL,
  benefits_package TEXT,
  bonus_structure TEXT,
  equity_details TEXT,
  vacation_days INTEGER DEFAULT 20,
  sick_leave_days INTEGER DEFAULT 10,
  remote_policy TEXT,
  probation_period_months INTEGER DEFAULT 3,
  notice_period_days INTEGER DEFAULT 30,
  reporting_manager TEXT,
  offer_expiry_date DATE,
  additional_notes TEXT,
  status TEXT DEFAULT 'draft' NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Email templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Email logs table
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'sent' NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Aptitude questions table
CREATE TABLE IF NOT EXISTS public.aptitude_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  category TEXT DEFAULT 'general' NOT NULL,
  difficulty TEXT DEFAULT 'medium' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Aptitude answers table
CREATE TABLE IF NOT EXISTS public.aptitude_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES aptitude_questions(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- HR Google tokens table
CREATE TABLE IF NOT EXISTS public.hr_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
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
-- HELPER FUNCTIONS (SECURITY DEFINER - prevents RLS recursion)
-- =====================================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is any HR staff member
CREATE OR REPLACE FUNCTION public.is_hr_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Drop existing policies to avoid conflicts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- PROFILES POLICIES
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_select_hr" ON public.profiles FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- USER_ROLES POLICIES
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_roles_insert_own" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'recruiter');
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- JOBS POLICIES
CREATE POLICY "jobs_select_active" ON public.jobs FOR SELECT USING (is_active = true);
CREATE POLICY "jobs_select_hr" ON public.jobs FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "jobs_insert_hr" ON public.jobs FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));
CREATE POLICY "jobs_update_hr" ON public.jobs FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "jobs_delete_hr" ON public.jobs FOR DELETE USING (is_hr_staff(auth.uid()));

-- CANDIDATES POLICIES
CREATE POLICY "candidates_select_hr" ON public.candidates FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "candidates_insert_public" ON public.candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "candidates_update_hr" ON public.candidates FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "candidates_delete_hr" ON public.candidates FOR DELETE USING (is_hr_staff(auth.uid()));
-- Public select for candidate portal (via access token - handled in application logic)
CREATE POLICY "candidates_select_public" ON public.candidates FOR SELECT USING (true);

-- APPLICATIONS POLICIES
CREATE POLICY "applications_select_hr" ON public.applications FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "applications_insert_public" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "applications_update_hr" ON public.applications FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "applications_delete_hr" ON public.applications FOR DELETE USING (is_hr_staff(auth.uid()));
-- Service role bypass for auto-processing (handled via service role key)

-- INTERVIEWS POLICIES
CREATE POLICY "interviews_select_hr" ON public.interviews FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "interviews_insert_hr" ON public.interviews FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));
CREATE POLICY "interviews_update_hr" ON public.interviews FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "interviews_delete_hr" ON public.interviews FOR DELETE USING (is_hr_staff(auth.uid()));

-- OFFER_LETTERS POLICIES
CREATE POLICY "offer_letters_select_hr" ON public.offer_letters FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "offer_letters_insert_hr" ON public.offer_letters FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));
CREATE POLICY "offer_letters_update_hr" ON public.offer_letters FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "offer_letters_delete_hr" ON public.offer_letters FOR DELETE USING (is_hr_staff(auth.uid()));

-- EMAIL_TEMPLATES POLICIES
CREATE POLICY "email_templates_select_hr" ON public.email_templates FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "email_templates_insert_hr" ON public.email_templates FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));
CREATE POLICY "email_templates_update_hr" ON public.email_templates FOR UPDATE USING (is_hr_staff(auth.uid()));
CREATE POLICY "email_templates_delete_hr" ON public.email_templates FOR DELETE USING (is_hr_staff(auth.uid()));

-- EMAIL_LOGS POLICIES
CREATE POLICY "email_logs_select_hr" ON public.email_logs FOR SELECT USING (is_hr_staff(auth.uid()));
CREATE POLICY "email_logs_insert_hr" ON public.email_logs FOR INSERT WITH CHECK (is_hr_staff(auth.uid()));

-- APTITUDE_QUESTIONS POLICIES
CREATE POLICY "aptitude_questions_select_active" ON public.aptitude_questions FOR SELECT USING (is_active = true);
CREATE POLICY "aptitude_questions_all_hr" ON public.aptitude_questions FOR ALL USING (is_hr_staff(auth.uid()));

-- APTITUDE_ANSWERS POLICIES
CREATE POLICY "aptitude_answers_insert_public" ON public.aptitude_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "aptitude_answers_select_hr" ON public.aptitude_answers FOR SELECT USING (is_hr_staff(auth.uid()));

-- HR_GOOGLE_TOKENS POLICIES
CREATE POLICY "hr_google_tokens_all_own" ON public.hr_google_tokens FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- UTILITY FUNCTIONS
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
-- TRIGGERS
-- =====================================================

-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
DROP TRIGGER IF EXISTS update_candidates_updated_at ON public.candidates;
DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
DROP TRIGGER IF EXISTS update_interviews_updated_at ON public.interviews;
DROP TRIGGER IF EXISTS update_offer_letters_updated_at ON public.offer_letters;
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
DROP TRIGGER IF EXISTS update_aptitude_questions_updated_at ON public.aptitude_questions;
DROP TRIGGER IF EXISTS update_hr_google_tokens_updated_at ON public.hr_google_tokens;

-- Create updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offer_letters_updated_at BEFORE UPDATE ON public.offer_letters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_aptitude_questions_updated_at BEFORE UPDATE ON public.aptitude_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hr_google_tokens_updated_at BEFORE UPDATE ON public.hr_google_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- AUTH TRIGGERS
-- =====================================================

-- Handle new user signup - create profile
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

-- Handle new user signup - assign default role
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

-- Drop existing auth triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_role_created ON auth.users;

-- Create auth triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_role();

-- =====================================================
-- AUTO-PROCESS APPLICATION TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Make async HTTP POST to the edge function
  -- REPLACE YOUR_PROJECT_URL and YOUR_ANON_KEY below
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
  FOR EACH ROW EXECUTE FUNCTION trigger_auto_process_application();

-- =====================================================
-- AUTO-CREATE OFFER LETTER TRIGGER
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
  -- Only trigger when status changes to 'offer'
  IF NEW.status = 'offer' AND (OLD.status IS NULL OR OLD.status <> 'offer') THEN
    -- Check if offer letter already exists
    SELECT id INTO existing_offer FROM offer_letters WHERE application_id = NEW.id;
    
    IF existing_offer IS NULL THEN
      -- Get job details
      SELECT title, department, location INTO job_record
      FROM jobs WHERE id = NEW.job_id;
      
      -- Create draft offer letter
      INSERT INTO offer_letters (
        application_id,
        position_title,
        department,
        work_location,
        salary_amount,
        salary_currency,
        salary_frequency,
        proposed_start_date,
        status
      ) VALUES (
        NEW.id,
        job_record.title,
        job_record.department,
        job_record.location,
        0,
        'USD',
        'yearly',
        CURRENT_DATE + INTERVAL '14 days',
        'draft'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_status_change ON public.applications;
CREATE TRIGGER on_application_status_change
  AFTER UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION auto_create_offer_draft();

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies
DROP POLICY IF EXISTS "HR staff can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "HR staff can view resumes" ON storage.objects;
DROP POLICY IF EXISTS "HR staff can delete resumes" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access" ON storage.objects;

-- Storage policies for resumes bucket
CREATE POLICY "HR staff can upload resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "HR staff can view resumes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "HR staff can delete resumes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resumes' AND
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

-- =====================================================
-- SEED DATA
-- =====================================================

-- Sample jobs
INSERT INTO public.jobs (title, department, location, job_type, description, requirements, is_active) VALUES
('Senior Software Engineer', 'Engineering', 'Remote', 'full-time', 
 'We are looking for a Senior Software Engineer to join our growing team.',
 'Requirements:\n- 5+ years of experience\n- Proficiency in React and Node.js\n- Strong problem-solving skills',
 true),
('Product Manager', 'Product', 'New York, NY', 'full-time',
 'Lead product strategy and work with cross-functional teams.',
 'Requirements:\n- 3+ years of PM experience\n- Strong communication skills\n- Data-driven mindset',
 true),
('UX Designer', 'Design', 'San Francisco, CA', 'full-time',
 'Create beautiful and intuitive user experiences.',
 'Requirements:\n- Portfolio demonstrating UX work\n- Figma proficiency\n- User research experience',
 true)
ON CONFLICT DO NOTHING;

-- Sample email templates
INSERT INTO public.email_templates (name, email_type, subject, body, is_default) VALUES
('Application Received', 'acknowledgment',
 'Application Received - {{job_title}}',
 'Dear {{candidate_name}},\n\nThank you for applying for the {{job_title}} position. We have received your application and will review it shortly.\n\nBest regards,\nHR Team',
 true),
('Interview Invitation', 'interview',
 'Interview Invitation - {{job_title}}',
 'Dear {{candidate_name}},\n\nWe are pleased to invite you for an interview for the {{job_title}} position.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\nLocation: {{interview_location}}\n\nPlease confirm your availability.\n\nBest regards,\nHR Team',
 true),
('Rejection Notice', 'rejection',
 'Application Update - {{job_title}}',
 'Dear {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position. After careful consideration, we have decided to move forward with other candidates.\n\nWe appreciate your time and wish you success in your job search.\n\nBest regards,\nHR Team',
 true)
ON CONFLICT DO NOTHING;

-- Sample aptitude questions
INSERT INTO public.aptitude_questions (question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, is_active) VALUES
('What is the time complexity of binary search?', 'O(n)', 'O(log n)', 'O(n²)', 'O(1)', 'B', 'algorithms', 'medium', true),
('Which data structure uses LIFO?', 'Queue', 'Stack', 'Array', 'Linked List', 'B', 'data_structures', 'easy', true),
('What does SQL stand for?', 'Simple Query Language', 'Structured Query Language', 'Standard Query Language', 'System Query Language', 'B', 'databases', 'easy', true),
('What is the purpose of a foreign key?', 'Primary identifier', 'Link between tables', 'Index optimization', 'Data encryption', 'B', 'databases', 'medium', true),
('Which HTTP method is idempotent?', 'POST', 'GET', 'PATCH', 'All of the above', 'B', 'programming', 'medium', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ CortexHR schema setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Deploy edge functions: supabase functions deploy --project-ref YOUR_REF';
  RAISE NOTICE '2. Set secrets in Edge Functions settings';
  RAISE NOTICE '3. Update .env with your credentials';
  RAISE NOTICE '4. Run: npm install && npm run dev';
END $$;
