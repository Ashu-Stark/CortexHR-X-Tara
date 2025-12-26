-- Enable the pg_net extension for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a function to trigger auto-processing via HTTP
CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url text := 'https://cjfpimkuulgpxodtzohw.supabase.co';
  service_role_key text;
BEGIN
  -- Get the service role key from vault (or use anon key for public function)
  -- Since auto-process-application has verify_jwt = false, we can call it without auth
  
  -- Make async HTTP POST to the edge function
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/auto-process-application',
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

-- Create the trigger on applications table
DROP TRIGGER IF EXISTS on_application_created ON public.applications;
CREATE TRIGGER on_application_created
  AFTER INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_process_application();