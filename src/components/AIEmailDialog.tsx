import { useState, useEffect } from 'react';
import { Loader2, Sparkles, Mail, Send, Copy, Check, RefreshCw, FileText } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

interface AIEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  email_type: string;
  subject: string;
  body: string;
  is_default: boolean;
}

type EmailType = 'interview_invite' | 'rejection' | 'offer' | 'follow_up' | 'custom';

const emailTypeLabels: Record<EmailType, string> = {
  interview_invite: 'Interview Invitation',
  rejection: 'Rejection Letter',
  offer: 'Offer Announcement',
  follow_up: 'Follow-up',
  custom: 'Custom Email',
};

export function AIEmailDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  candidateEmail,
}: AIEmailDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emailType, setEmailType] = useState<EmailType>('interview_invite');
  const [customPrompt, setCustomPrompt] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Fetch email templates
  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  // Filter templates when email type changes
  const filteredTemplates = templates.filter(t => 
    t.email_type === emailType || t.email_type === 'custom'
  );

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('is_default', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Apply template placeholders
  const applyPlaceholders = (text: string): string => {
    return text
      .replace(/\{\{candidateName\}\}/gi, candidateName)
      .replace(/\{\{position\}\}/gi, 'the position')
      .replace(/\{\{company\}\}/gi, 'CortexHR')
      .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString())
      .replace(/\{\{time\}\}/gi, '');
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(applyPlaceholders(template.subject));
      setBody(applyPlaceholders(template.body));
      setHtmlBody('');
      toast.success(`Template "${template.name}" applied`);
    }
  };

  const generateEmail = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-draft', {
        body: {
          applicationId,
          emailType,
          customPrompt: emailType === 'custom' ? customPrompt : undefined,
          additionalContext,
        },
      });

      if (error) {
        if ((error as any)?.context?.status === 429) {
          toast.error('Rate limit reached. Please try again in a moment.');
          return;
        }
        throw error;
      }

      setSubject(data.subject);
      setBody(data.body);
      setHtmlBody(data.htmlBody);
      setSelectedTemplateId(''); // Clear template selection after AI generation
      toast.success('Email draft generated');
    } catch (error: any) {
      toast.error(`Failed to generate email: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const sendEmail = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Please generate or write an email first');
      return;
    }

    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: candidateEmail,
          subject,
          html: htmlBody || `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${body}</div>`,
          emailType: emailType,
        },
      });

      if (error) throw error;

      toast.success(`Email sent to ${candidateEmail}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to send email: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Email copied to clipboard');
  };

  const resetForm = () => {
    setSubject('');
    setBody('');
    setHtmlBody('');
    setAdditionalContext('');
    setCustomPrompt('');
    setSelectedTemplateId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            AI Email Composer
          </DialogTitle>
          <DialogDescription>
            Generate and send a personalized email to {candidateName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Email Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email Type</Label>
              <Select
                value={emailType}
                onValueChange={(v) => {
                  setEmailType(v as EmailType);
                  resetForm();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(emailTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Input value={candidateEmail} disabled className="bg-muted" />
            </div>
          </div>

          {/* Template Selection */}
          {filteredTemplates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Use Template
                </Label>
                {loadingTemplates && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              <Select 
                value={selectedTemplateId} 
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Start from a saved template..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        {template.name}
                        {template.is_default && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select a template to pre-fill subject and body, then customize as needed
              </p>
            </div>
          )}

          {/* Custom Prompt (for custom emails) */}
          {emailType === 'custom' && (
            <div className="space-y-2">
              <Label>What kind of email do you want to send?</Label>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g., A friendly check-in to see if they're still interested in the position..."
                rows={2}
              />
            </div>
          )}

          {/* Additional Context */}
          <div className="space-y-2">
            <Label>Additional Context (optional)</Label>
            <Textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="e.g., Interview scheduled for Monday at 2pm, meeting with the engineering team..."
              rows={2}
            />
          </div>

          {/* Generate Button */}
          <div className="flex gap-2">
            <Button
              onClick={generateEmail}
              disabled={isGenerating || (emailType === 'custom' && !customPrompt)}
              className="flex-1"
              variant="secondary"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : subject ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {subject ? 'Regenerate with AI' : 'Generate AI Draft'}
            </Button>
          </div>

          {/* Email Preview/Edit */}
          {(subject || body) && (
            <div className="space-y-4 border border-border rounded-lg p-4 bg-secondary/30">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Body</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Email body..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {(subject || body) && (
              <>
                <Button variant="secondary" onClick={copyToClipboard}>
                  {copied ? (
                    <Check className="w-4 h-4 mr-2 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  Copy
                </Button>
                <Button onClick={sendEmail} disabled={isSending || !subject.trim()}>
                  {isSending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Email
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
