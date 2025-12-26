-- Update the trigger function to use pg_net correctly
CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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