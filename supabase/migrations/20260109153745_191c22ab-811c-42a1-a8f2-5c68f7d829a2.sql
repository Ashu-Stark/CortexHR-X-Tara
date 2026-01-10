-- Allow new users to insert their own role during signup (only recruiter role)
CREATE POLICY "Users can insert own recruiter role during signup"
ON public.user_roles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND role = 'recruiter'::app_role
);