-- Fix the trigger function to use direct URL instead of vault secrets (which may not be accessible)
CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS TRIGGER AS $$
BEGIN
  -- Make async HTTP POST to the edge function using pg_net with direct URL
  PERFORM net.http_post(
    url := 'https://hbarsqrflasfsfvsvkth.supabase.co/functions/v1/auto-process-application',
    body := jsonb_build_object('applicationId', NEW.id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYXJzcXJmbGFzZnNmdnN2a3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NjY1NjgsImV4cCI6MjA4MzU0MjU2OH0.ljkzElD3o1ZG9oxZMSpSTkaE8HoC7GihCQP4FFfOpEQ'
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Auto-process trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;