-- Create a function to auto-process new applications
CREATE OR REPLACE FUNCTION public.trigger_auto_process_application()
RETURNS TRIGGER AS $$
DECLARE
  http_response record;
BEGIN
  -- Call the auto-process-application edge function via pg_net
  -- This happens asynchronously so it doesn't block the insert
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/auto-process-application',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := jsonb_build_object('applicationId', NEW.id::text)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-process applications on insert
DROP TRIGGER IF EXISTS auto_process_application_trigger ON public.applications;
CREATE TRIGGER auto_process_application_trigger
  AFTER INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_process_application();