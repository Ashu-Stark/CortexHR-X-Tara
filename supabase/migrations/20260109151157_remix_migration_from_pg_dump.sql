CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'recruiter',
    'hr_manager'
);


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.application_status AS ENUM (
    'applied',
    'screening',
    'interview',
    'offer',
    'hired',
    'rejected'
);


--
-- Name: auto_create_offer_draft(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_create_offer_draft() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: handle_new_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'recruiter');
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_hr_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_hr_staff(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;


--
-- Name: trigger_auto_process_application(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_auto_process_application() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Make async HTTP POST to the edge function using pg_net
  PERFORM net.http_post(
    url := 'https://cjfpimkuulgpxodtzohw.supabase.co/functions/v1/auto-process-application',
    body := jsonb_build_object('applicationId', NEW.id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZnBpbWt1dWxncHhvZHR6b2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0NzcxOTUsImV4cCI6MjA4MjA1MzE5NX0.hhbirGLzy5_ymoe9sFYlPO6_WXLlA00s2GUx0apy8rQ'
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


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid NOT NULL,
    job_id uuid NOT NULL,
    status public.application_status DEFAULT 'applied'::public.application_status NOT NULL,
    ai_score integer,
    ai_summary text,
    ai_skills jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    aptitude_score integer,
    aptitude_completed boolean DEFAULT false,
    CONSTRAINT applications_ai_score_check CHECK (((ai_score >= 0) AND (ai_score <= 100)))
);


--
-- Name: aptitude_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aptitude_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    question_id uuid NOT NULL,
    selected_option text NOT NULL,
    is_correct boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aptitude_answers_selected_option_check CHECK ((selected_option = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])))
);


--
-- Name: aptitude_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aptitude_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_text text NOT NULL,
    option_a text NOT NULL,
    option_b text NOT NULL,
    option_c text NOT NULL,
    option_d text NOT NULL,
    correct_option text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    difficulty text DEFAULT 'medium'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aptitude_questions_correct_option_check CHECK ((correct_option = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]))),
    CONSTRAINT aptitude_questions_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])))
);


--
-- Name: candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    resume_url text,
    resume_text text,
    access_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parsed_resume jsonb,
    github_url text,
    linkedin_url text,
    portfolio_url text,
    portfolio_analysis jsonb
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id uuid,
    email_type text NOT NULL,
    recipient_email text NOT NULL,
    subject text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email_type text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    created_by uuid,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hr_google_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_google_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expiry timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 45 NOT NULL,
    interview_type text DEFAULT 'Technical'::text NOT NULL,
    meeting_url text,
    meeting_id text,
    notes text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    department text NOT NULL,
    location text NOT NULL,
    job_type text DEFAULT 'Full-time'::text NOT NULL,
    description text,
    requirements text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_hr_id uuid
);


--
-- Name: offer_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    position_title text NOT NULL,
    department text NOT NULL,
    employment_type text DEFAULT 'Full-time'::text NOT NULL,
    work_location text NOT NULL,
    remote_policy text,
    salary_amount numeric(12,2) NOT NULL,
    salary_currency text DEFAULT 'USD'::text NOT NULL,
    salary_frequency text DEFAULT 'yearly'::text NOT NULL,
    bonus_structure text,
    equity_details text,
    proposed_start_date date NOT NULL,
    offer_expiry_date date,
    benefits_package text,
    vacation_days integer,
    sick_leave_days integer,
    probation_period_months integer DEFAULT 3,
    notice_period_days integer DEFAULT 30,
    reporting_manager text,
    additional_notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: applications applications_candidate_id_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_candidate_id_job_id_key UNIQUE (candidate_id, job_id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: aptitude_answers aptitude_answers_application_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aptitude_answers
    ADD CONSTRAINT aptitude_answers_application_id_question_id_key UNIQUE (application_id, question_id);


--
-- Name: aptitude_answers aptitude_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aptitude_answers
    ADD CONSTRAINT aptitude_answers_pkey PRIMARY KEY (id);


--
-- Name: aptitude_questions aptitude_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aptitude_questions
    ADD CONSTRAINT aptitude_questions_pkey PRIMARY KEY (id);


--
-- Name: candidates candidates_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_access_token_key UNIQUE (access_token);


--
-- Name: candidates candidates_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_email_key UNIQUE (email);


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: hr_google_tokens hr_google_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_google_tokens
    ADD CONSTRAINT hr_google_tokens_pkey PRIMARY KEY (id);


--
-- Name: hr_google_tokens hr_google_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_google_tokens
    ADD CONSTRAINT hr_google_tokens_user_id_key UNIQUE (user_id);


--
-- Name: interviews interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: offer_letters offer_letters_application_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_letters
    ADD CONSTRAINT offer_letters_application_id_key UNIQUE (application_id);


--
-- Name: offer_letters offer_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_letters
    ADD CONSTRAINT offer_letters_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: applications auto_create_offer_on_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_create_offer_on_status_change AFTER UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.auto_create_offer_draft();


--
-- Name: applications on_application_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_application_created AFTER INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_process_application();


--
-- Name: applications update_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: candidates update_candidates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hr_google_tokens update_hr_google_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hr_google_tokens_updated_at BEFORE UPDATE ON public.hr_google_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: interviews update_interviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: jobs update_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: offer_letters update_offer_letters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_offer_letters_updated_at BEFORE UPDATE ON public.offer_letters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: applications applications_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;


--
-- Name: applications applications_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: aptitude_answers aptitude_answers_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aptitude_answers
    ADD CONSTRAINT aptitude_answers_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: aptitude_answers aptitude_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aptitude_answers
    ADD CONSTRAINT aptitude_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.aptitude_questions(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hr_google_tokens hr_google_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_google_tokens
    ADD CONSTRAINT hr_google_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interviews interviews_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: interviews interviews_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: jobs jobs_assigned_hr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_assigned_hr_id_fkey FOREIGN KEY (assigned_hr_id) REFERENCES auth.users(id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: offer_letters offer_letters_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_letters
    ADD CONSTRAINT offer_letters_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: offer_letters offer_letters_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_letters
    ADD CONSTRAINT offer_letters_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: aptitude_answers Anyone can insert aptitude answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert aptitude answers" ON public.aptitude_answers FOR INSERT WITH CHECK (true);


--
-- Name: aptitude_questions Anyone can view active aptitude questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active aptitude questions" ON public.aptitude_questions FOR SELECT USING ((is_active = true));


--
-- Name: jobs Anyone can view active jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active jobs" ON public.jobs FOR SELECT USING ((is_active = true));


--
-- Name: candidates Candidates can view own data via token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Candidates can view own data via token" ON public.candidates FOR SELECT USING (true);


--
-- Name: email_logs HR staff can create email logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can create email logs" ON public.email_logs FOR INSERT WITH CHECK (public.is_hr_staff(auth.uid()));


--
-- Name: aptitude_questions HR staff can manage aptitude questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage aptitude questions" ON public.aptitude_questions USING (public.is_hr_staff(auth.uid()));


--
-- Name: applications HR staff can manage assigned applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage assigned applications" ON public.applications USING ((public.is_hr_staff(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = applications.job_id) AND ((jobs.assigned_hr_id IS NULL) OR (jobs.assigned_hr_id = auth.uid())))))));


--
-- Name: candidates HR staff can manage candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage candidates" ON public.candidates USING (public.is_hr_staff(auth.uid()));


--
-- Name: email_templates HR staff can manage email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage email templates" ON public.email_templates USING (public.is_hr_staff(auth.uid()));


--
-- Name: interviews HR staff can manage interviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage interviews" ON public.interviews USING (public.is_hr_staff(auth.uid()));


--
-- Name: jobs HR staff can manage jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage jobs" ON public.jobs USING (public.is_hr_staff(auth.uid()));


--
-- Name: offer_letters HR staff can manage offer letters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can manage offer letters" ON public.offer_letters USING (public.is_hr_staff(auth.uid()));


--
-- Name: profiles HR staff can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view all profiles" ON public.profiles FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: aptitude_answers HR staff can view aptitude answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view aptitude answers" ON public.aptitude_answers FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: applications HR staff can view assigned applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view assigned applications" ON public.applications FOR SELECT USING ((public.is_hr_staff(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = applications.job_id) AND ((jobs.assigned_hr_id IS NULL) OR (jobs.assigned_hr_id = auth.uid())))))));


--
-- Name: jobs HR staff can view assigned jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view assigned jobs" ON public.jobs FOR SELECT USING ((public.is_hr_staff(auth.uid()) AND ((assigned_hr_id IS NULL) OR (assigned_hr_id = auth.uid()))));


--
-- Name: candidates HR staff can view candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view candidates" ON public.candidates FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: email_logs HR staff can view email logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view email logs" ON public.email_logs FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: email_templates HR staff can view email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view email templates" ON public.email_templates FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: interviews HR staff can view interviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view interviews" ON public.interviews FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: offer_letters HR staff can view offer letters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "HR staff can view offer letters" ON public.offer_letters FOR SELECT USING (public.is_hr_staff(auth.uid()));


--
-- Name: candidates Public can check own email; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can check own email" ON public.candidates FOR SELECT USING (true);


--
-- Name: applications Public can insert applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert applications" ON public.applications FOR INSERT WITH CHECK (true);


--
-- Name: candidates Public can insert candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert candidates" ON public.candidates FOR INSERT WITH CHECK (true);


--
-- Name: hr_google_tokens Users can manage own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own tokens" ON public.hr_google_tokens USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: aptitude_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aptitude_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: aptitude_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aptitude_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_google_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hr_google_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: interviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_letters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;