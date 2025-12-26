-- Create email_templates table
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "HR staff can manage email templates"
ON public.email_templates
FOR ALL
USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can view email templates"
ON public.email_templates
FOR SELECT
USING (is_hr_staff(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create offer letter draft
CREATE OR REPLACE FUNCTION public.auto_create_offer_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Create trigger for auto offer creation
CREATE TRIGGER auto_create_offer_on_status_change
AFTER UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_offer_draft();

-- Add google_tokens table for calendar integration
CREATE TABLE public.hr_google_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.hr_google_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only manage their own tokens
CREATE POLICY "Users can manage own tokens"
ON public.hr_google_tokens
FOR ALL
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_hr_google_tokens_updated_at
BEFORE UPDATE ON public.hr_google_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();