-- =====================================================
-- CortexHR Database Schema - Migration 003
-- Functions and Triggers
-- =====================================================

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
-- AUTH TRIGGERS
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

CREATE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- =====================================================
-- AUTO-PROCESSING TRIGGER
-- =====================================================

-- Trigger auto-processing when application is created
CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Make async HTTP POST to the edge function using pg_net
  -- IMPORTANT: Update the URL and API key for your Supabase project
  PERFORM net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/auto-process-application',
    body := jsonb_build_object('applicationId', NEW.id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_SUPABASE_ANON_KEY'
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

CREATE TRIGGER on_application_created
  AFTER INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_process_application();

-- =====================================================
-- OFFER LETTER AUTO-CREATE
-- =====================================================

-- Auto-create draft offer letter when application moves to 'offer' status
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

CREATE TRIGGER on_application_status_change
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_offer_draft();

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_offer_letters_updated_at
  BEFORE UPDATE ON public.offer_letters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aptitude_questions_updated_at
  BEFORE UPDATE ON public.aptitude_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hr_google_tokens_updated_at
  BEFORE UPDATE ON public.hr_google_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
