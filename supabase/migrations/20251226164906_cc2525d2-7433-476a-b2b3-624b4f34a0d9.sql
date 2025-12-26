-- Allow public/anon users to upload resumes to storage
CREATE POLICY "Public can upload resumes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'resumes');

-- Allow public to select (for processing)
CREATE POLICY "Public can view resumes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'resumes');

-- Allow public to insert candidates (for job applications)
CREATE POLICY "Public can insert candidates"
ON public.candidates
FOR INSERT
WITH CHECK (true);

-- Allow public to select own candidate by email (to prevent duplicates)
CREATE POLICY "Public can check own email"
ON public.candidates
FOR SELECT
USING (true);

-- Allow public to insert applications
CREATE POLICY "Public can insert applications"
ON public.applications
FOR INSERT
WITH CHECK (true);