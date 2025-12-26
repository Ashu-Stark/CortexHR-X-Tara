-- Create storage policies for the resumes bucket
-- Allow anyone to upload resumes (for public job applications)
CREATE POLICY "Allow public resume uploads"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'resumes');

-- Allow anyone to read resumes (for processing)
CREATE POLICY "Allow public resume reads"
ON storage.objects
FOR SELECT
USING (bucket_id = 'resumes');

-- Allow updates to resumes
CREATE POLICY "Allow resume updates"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'resumes');

-- Allow deletes for HR staff
CREATE POLICY "Allow resume deletes for authenticated users"
ON storage.objects
FOR DELETE
USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');