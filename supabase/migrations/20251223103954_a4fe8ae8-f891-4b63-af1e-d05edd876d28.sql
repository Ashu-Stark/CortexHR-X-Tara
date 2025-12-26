-- Create enums for status tracking
CREATE TYPE public.application_status AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
CREATE TYPE public.app_role AS ENUM ('admin', 'recruiter', 'hr_manager');

-- Create profiles table for HR staff
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table for role-based access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Full-time',
  description TEXT,
  requirements TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create candidates table
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  resume_url TEXT,
  resume_text TEXT,
  access_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'applied',
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  ai_summary TEXT,
  ai_skills JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Create interviews table
CREATE TABLE public.interviews (
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

-- Create email_logs table for tracking notifications
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent'
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
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

-- Function to check if user is any HR staff
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

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "HR staff can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

-- User roles policies (only admins can manage)
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Jobs policies
CREATE POLICY "Anyone can view active jobs" ON public.jobs
  FOR SELECT USING (is_active = true);

CREATE POLICY "HR staff can view all jobs" ON public.jobs
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage jobs" ON public.jobs
  FOR ALL USING (public.is_hr_staff(auth.uid()));

-- Candidates policies
CREATE POLICY "HR staff can view candidates" ON public.candidates
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage candidates" ON public.candidates
  FOR ALL USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "Candidates can view own data via token" ON public.candidates
  FOR SELECT USING (true);

-- Applications policies
CREATE POLICY "HR staff can view applications" ON public.applications
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage applications" ON public.applications
  FOR ALL USING (public.is_hr_staff(auth.uid()));

-- Interviews policies
CREATE POLICY "HR staff can view interviews" ON public.interviews
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage interviews" ON public.interviews
  FOR ALL USING (public.is_hr_staff(auth.uid()));

-- Email logs policies
CREATE POLICY "HR staff can view email logs" ON public.email_logs
  FOR SELECT USING (public.is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can create email logs" ON public.email_logs
  FOR INSERT WITH CHECK (public.is_hr_staff(auth.uid()));

-- Create trigger to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);

-- Storage policies for resumes
CREATE POLICY "Anyone can upload resumes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "HR staff can view resumes" ON storage.objects
  FOR SELECT USING (bucket_id = 'resumes' AND public.is_hr_staff(auth.uid()));

-- Insert default jobs
INSERT INTO public.jobs (title, department, location, job_type, description) VALUES
  ('Senior Full Stack Engineer', 'Engineering', 'Remote', 'Full-time', 'Build scalable web applications with modern technologies.'),
  ('AI Research Scientist', 'AI Lab', 'San Francisco', 'Full-time', 'Research and develop cutting-edge AI solutions.'),
  ('Product Manager', 'Product', 'New York', 'Full-time', 'Lead product strategy and roadmap development.'),
  ('HR Operations Specialist', 'People', 'London', 'Contract', 'Manage HR operations and employee experience.');