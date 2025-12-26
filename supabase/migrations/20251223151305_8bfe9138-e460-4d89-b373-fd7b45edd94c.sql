-- Create offer_letters table for storing offer letter drafts
CREATE TABLE public.offer_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    
    -- Position details
    position_title TEXT NOT NULL,
    department TEXT NOT NULL,
    employment_type TEXT NOT NULL DEFAULT 'Full-time',
    work_location TEXT NOT NULL,
    remote_policy TEXT,
    
    -- Compensation
    salary_amount DECIMAL(12, 2) NOT NULL,
    salary_currency TEXT NOT NULL DEFAULT 'USD',
    salary_frequency TEXT NOT NULL DEFAULT 'yearly',
    bonus_structure TEXT,
    equity_details TEXT,
    
    -- Dates
    proposed_start_date DATE NOT NULL,
    offer_expiry_date DATE,
    
    -- Benefits
    benefits_package TEXT,
    vacation_days INTEGER,
    sick_leave_days INTEGER,
    
    -- Employment terms
    probation_period_months INTEGER DEFAULT 3,
    notice_period_days INTEGER DEFAULT 30,
    reporting_manager TEXT,
    
    -- Additional details
    additional_notes TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    sent_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(application_id)
);

-- Enable RLS
ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "HR staff can manage offer letters"
ON public.offer_letters
FOR ALL
USING (is_hr_staff(auth.uid()));

CREATE POLICY "HR staff can view offer letters"
ON public.offer_letters
FOR SELECT
USING (is_hr_staff(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_offer_letters_updated_at
BEFORE UPDATE ON public.offer_letters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();