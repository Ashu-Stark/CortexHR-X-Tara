import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, FileText, Send, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const offerLetterSchema = z.object({
  position_title: z.string().min(1, 'Position title is required'),
  department: z.string().min(1, 'Department is required'),
  employment_type: z.string().min(1, 'Employment type is required'),
  work_location: z.string().min(1, 'Work location is required'),
  remote_policy: z.string().optional(),
  salary_amount: z.number().min(1, 'Salary is required'),
  salary_currency: z.string().default('USD'),
  salary_frequency: z.string().default('yearly'),
  bonus_structure: z.string().optional(),
  equity_details: z.string().optional(),
  proposed_start_date: z.string().min(1, 'Start date is required'),
  offer_expiry_date: z.string().optional(),
  benefits_package: z.string().optional(),
  vacation_days: z.number().optional(),
  sick_leave_days: z.number().optional(),
  probation_period_months: z.number().optional(),
  notice_period_days: z.number().optional(),
  reporting_manager: z.string().optional(),
  additional_notes: z.string().optional(),
});

type OfferLetterFormData = z.infer<typeof offerLetterSchema>;

interface OfferLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  department?: string;
  location?: string;
  onSuccess?: () => void;
}

export function OfferLetterDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  jobTitle,
  department = '',
  location = '',
  onSuccess,
}: OfferLetterDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [existingOffer, setExistingOffer] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<OfferLetterFormData>({
    resolver: zodResolver(offerLetterSchema),
    defaultValues: {
      position_title: jobTitle,
      department: department,
      employment_type: 'Full-time',
      work_location: location,
      salary_currency: 'USD',
      salary_frequency: 'yearly',
      probation_period_months: 3,
      notice_period_days: 30,
      vacation_days: 20,
      sick_leave_days: 10,
    },
  });

  useEffect(() => {
    if (open && applicationId) {
      loadExistingOffer();
    }
  }, [open, applicationId]);

  const loadExistingOffer = async () => {
    const { data } = await supabase
      .from('offer_letters')
      .select('*')
      .eq('application_id', applicationId)
      .single();

    if (data) {
      setExistingOffer(data);
      form.reset({
        position_title: data.position_title,
        department: data.department,
        employment_type: data.employment_type,
        work_location: data.work_location,
        remote_policy: data.remote_policy || '',
        salary_amount: Number(data.salary_amount),
        salary_currency: data.salary_currency,
        salary_frequency: data.salary_frequency,
        bonus_structure: data.bonus_structure || '',
        equity_details: data.equity_details || '',
        proposed_start_date: data.proposed_start_date,
        offer_expiry_date: data.offer_expiry_date || '',
        benefits_package: data.benefits_package || '',
        vacation_days: data.vacation_days || undefined,
        sick_leave_days: data.sick_leave_days || undefined,
        probation_period_months: data.probation_period_months || undefined,
        notice_period_days: data.notice_period_days || undefined,
        reporting_manager: data.reporting_manager || '',
        additional_notes: data.additional_notes || '',
      });
    } else {
      form.reset({
        position_title: jobTitle,
        department: department,
        employment_type: 'Full-time',
        work_location: location,
        salary_currency: 'USD',
        salary_frequency: 'yearly',
        probation_period_months: 3,
        notice_period_days: 30,
        vacation_days: 20,
        sick_leave_days: 10,
      });
    }
  };

  const saveOfferLetter = async (data: OfferLetterFormData, send: boolean = false) => {
    const offerData = {
      application_id: applicationId,
      position_title: data.position_title,
      department: data.department,
      employment_type: data.employment_type,
      work_location: data.work_location,
      remote_policy: data.remote_policy || null,
      salary_amount: data.salary_amount,
      salary_currency: data.salary_currency,
      salary_frequency: data.salary_frequency,
      bonus_structure: data.bonus_structure || null,
      equity_details: data.equity_details || null,
      proposed_start_date: data.proposed_start_date,
      offer_expiry_date: data.offer_expiry_date || null,
      benefits_package: data.benefits_package || null,
      vacation_days: data.vacation_days || null,
      sick_leave_days: data.sick_leave_days || null,
      probation_period_months: data.probation_period_months || null,
      notice_period_days: data.notice_period_days || null,
      reporting_manager: data.reporting_manager || null,
      additional_notes: data.additional_notes || null,
      status: send ? 'sending' : 'draft',
    };

    let offerId = existingOffer?.id;

    if (existingOffer) {
      const { error } = await supabase
        .from('offer_letters')
        .update(offerData)
        .eq('id', existingOffer.id);

      if (error) throw error;
    } else {
      const { data: newOffer, error } = await supabase
        .from('offer_letters')
        .insert(offerData)
        .select()
        .single();

      if (error) throw error;
      offerId = newOffer.id;
      setExistingOffer(newOffer);
    }

    return offerId;
  };

  const handleSave = async (data: OfferLetterFormData) => {
    setIsSaving(true);
    try {
      await saveOfferLetter(data, false);
      toast.success('Offer letter saved as draft');
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['offer-letters'] });
      onSuccess?.();
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (data: OfferLetterFormData) => {
    setIsSending(true);
    try {
      const offerId = await saveOfferLetter(data, true);

      const { data: result, error } = await supabase.functions.invoke('send-offer-letter', {
        body: { offerLetterId: offerId },
      });

      if (error) throw error;

      if (result.success) {
        toast.success('Offer letter sent successfully!');
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        queryClient.invalidateQueries({ queryKey: ['offer-letters'] });
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.info(result.message);
      }
    } catch (error: any) {
      toast.error(`Failed to send: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Offer Letter for {candidateName}
          </DialogTitle>
          <DialogDescription>
            Fill in the offer details. Save as draft or send directly to the candidate.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6 mt-4">
          {/* Position Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Position Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position_title">Position Title *</Label>
                <Input
                  id="position_title"
                  {...form.register('position_title')}
                  placeholder="e.g., Senior Software Engineer"
                />
                {form.formState.errors.position_title && (
                  <p className="text-xs text-destructive">{form.formState.errors.position_title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Input
                  id="department"
                  {...form.register('department')}
                  placeholder="e.g., Engineering"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_type">Employment Type *</Label>
                <Select
                  value={form.watch('employment_type')}
                  onValueChange={(value) => form.setValue('employment_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work_location">Work Location *</Label>
                <Input
                  id="work_location"
                  {...form.register('work_location')}
                  placeholder="e.g., New York, NY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remote_policy">Remote Policy</Label>
                <Select
                  value={form.watch('remote_policy') || ''}
                  onValueChange={(value) => form.setValue('remote_policy', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="On-site">On-site</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                    <SelectItem value="Remote">Fully Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reporting_manager">Reporting Manager</Label>
                <Input
                  id="reporting_manager"
                  {...form.register('reporting_manager')}
                  placeholder="e.g., John Smith, VP Engineering"
                />
              </div>
            </div>
          </div>

          {/* Compensation */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Compensation</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary_amount">Base Salary *</Label>
                <Input
                  id="salary_amount"
                  type="number"
                  {...form.register('salary_amount', { valueAsNumber: true })}
                  placeholder="e.g., 150000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_currency">Currency</Label>
                <Select
                  value={form.watch('salary_currency')}
                  onValueChange={(value) => form.setValue('salary_currency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_frequency">Frequency</Label>
                <Select
                  value={form.watch('salary_frequency')}
                  onValueChange={(value) => form.setValue('salary_frequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bonus_structure">Bonus Structure</Label>
                <Textarea
                  id="bonus_structure"
                  {...form.register('bonus_structure')}
                  placeholder="e.g., 15% annual performance bonus"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="equity_details">Equity Details</Label>
                <Textarea
                  id="equity_details"
                  {...form.register('equity_details')}
                  placeholder="e.g., 10,000 stock options vesting over 4 years"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Important Dates</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proposed_start_date">Proposed Start Date *</Label>
                <Input
                  id="proposed_start_date"
                  type="date"
                  {...form.register('proposed_start_date')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer_expiry_date">Offer Expiry Date</Label>
                <Input
                  id="offer_expiry_date"
                  type="date"
                  {...form.register('offer_expiry_date')}
                />
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Benefits & Leave</h3>
            <div className="space-y-2">
              <Label htmlFor="benefits_package">Benefits Package</Label>
              <Textarea
                id="benefits_package"
                {...form.register('benefits_package')}
                placeholder="e.g., Comprehensive health, dental, and vision insurance; 401(k) with 4% match; Learning & development budget..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vacation_days">Vacation Days/Year</Label>
                <Input
                  id="vacation_days"
                  type="number"
                  {...form.register('vacation_days', { valueAsNumber: true })}
                  placeholder="e.g., 20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sick_leave_days">Sick Leave Days/Year</Label>
                <Input
                  id="sick_leave_days"
                  type="number"
                  {...form.register('sick_leave_days', { valueAsNumber: true })}
                  placeholder="e.g., 10"
                />
              </div>
            </div>
          </div>

          {/* Employment Terms */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Employment Terms</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="probation_period_months">Probation Period (months)</Label>
                <Input
                  id="probation_period_months"
                  type="number"
                  {...form.register('probation_period_months', { valueAsNumber: true })}
                  placeholder="e.g., 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice_period_days">Notice Period (days)</Label>
                <Input
                  id="notice_period_days"
                  type="number"
                  {...form.register('notice_period_days', { valueAsNumber: true })}
                  placeholder="e.g., 30"
                />
              </div>
            </div>
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="additional_notes">Additional Notes</Label>
            <Textarea
              id="additional_notes"
              {...form.register('additional_notes')}
              placeholder="Any additional terms or special arrangements..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={form.handleSubmit(handleSave)}
              disabled={isSaving || isSending}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Draft
            </Button>
            <Button
              type="button"
              onClick={form.handleSubmit(handleSend)}
              disabled={isSaving || isSending}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Offer Letter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
