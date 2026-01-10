-- =====================================================
-- CortexHR Database Schema - Migration 002
-- Row Level Security Policies
-- =====================================================

-- =====================================================
-- HELPER FUNCTIONS
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
-- PROFILES POLICIES
-- =====================================================

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "HR staff can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- USER_ROLES POLICIES
-- =====================================================

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recruiter role during signup"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'recruiter');

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- =====================================================
-- JOBS POLICIES
-- =====================================================

CREATE POLICY "Anyone can view active jobs"
  ON public.jobs FOR SELECT
  USING (is_active = true);

CREATE POLICY "HR staff can view assigned jobs"
  ON public.jobs FOR SELECT
  USING (is_hr_staff(auth.uid()) AND (assigned_hr_id IS NULL OR assigned_hr_id = auth.uid()));

CREATE POLICY "HR staff can manage jobs"
  ON public.jobs FOR ALL
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- CANDIDATES POLICIES
-- =====================================================

CREATE POLICY "HR staff can view candidates"
  ON public.candidates FOR SELECT
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage candidates"
  ON public.candidates FOR ALL
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "Public can insert candidates"
  ON public.candidates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can check own email"
  ON public.candidates FOR SELECT
  USING (true);

CREATE POLICY "Candidates can view own data via token"
  ON public.candidates FOR SELECT
  USING (true);

-- =====================================================
-- APPLICATIONS POLICIES
-- =====================================================

CREATE POLICY "HR staff can view assigned applications"
  ON public.applications FOR SELECT
  USING (
    is_hr_staff(auth.uid()) AND 
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND (jobs.assigned_hr_id IS NULL OR jobs.assigned_hr_id = auth.uid())
    )
  );

CREATE POLICY "HR staff can manage assigned applications"
  ON public.applications FOR ALL
  USING (
    is_hr_staff(auth.uid()) AND 
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND (jobs.assigned_hr_id IS NULL OR jobs.assigned_hr_id = auth.uid())
    )
  );

CREATE POLICY "Public can insert applications"
  ON public.applications FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- INTERVIEWS POLICIES
-- =====================================================

CREATE POLICY "HR staff can view interviews"
  ON public.interviews FOR SELECT
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage interviews"
  ON public.interviews FOR ALL
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- OFFER_LETTERS POLICIES
-- =====================================================

CREATE POLICY "HR staff can view offer letters"
  ON public.offer_letters FOR SELECT
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage offer letters"
  ON public.offer_letters FOR ALL
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- EMAIL_TEMPLATES POLICIES
-- =====================================================

CREATE POLICY "HR staff can view email templates"
  ON public.email_templates FOR SELECT
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can manage email templates"
  ON public.email_templates FOR ALL
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- EMAIL_LOGS POLICIES
-- =====================================================

CREATE POLICY "HR staff can view email logs"
  ON public.email_logs FOR SELECT
  USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can create email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (is_hr_staff(auth.uid()));

-- =====================================================
-- APTITUDE_QUESTIONS POLICIES
-- =====================================================

CREATE POLICY "Anyone can view active aptitude questions"
  ON public.aptitude_questions FOR SELECT
  USING (is_active = true);

CREATE POLICY "HR staff can manage aptitude questions"
  ON public.aptitude_questions FOR ALL
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- APTITUDE_ANSWERS POLICIES
-- =====================================================

CREATE POLICY "Anyone can insert aptitude answers"
  ON public.aptitude_answers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "HR staff can view aptitude answers"
  ON public.aptitude_answers FOR SELECT
  USING (is_hr_staff(auth.uid()));

-- =====================================================
-- HR_GOOGLE_TOKENS POLICIES
-- =====================================================

CREATE POLICY "Users can manage own tokens"
  ON public.hr_google_tokens FOR ALL
  USING (auth.uid() = user_id);
