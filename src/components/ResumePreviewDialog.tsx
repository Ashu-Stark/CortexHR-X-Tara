import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Copy, Check, Mail, Phone, MapPin, Briefcase, GraduationCap, Award, Loader2, Sparkles, Languages, BadgeCheck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ResumePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  candidateId: string;
  resumeText: string | null;
  resumeUrl: string | null;
  cachedParsedResume?: ParsedResume | null;
}

interface ExperienceItem {
  title: string;
  company: string;
  duration?: string;
  description?: string;
}

interface EducationItem {
  degree: string;
  institution: string;
  year?: string;
}

interface ParsedResume {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications: string[];
  languages: string[];
}

// Section components for better organization
const SummarySection = ({ summary }: { summary: string }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <Award className="w-4 h-4" />
      Professional Summary
    </h3>
    <p className="text-sm text-muted-foreground leading-relaxed pl-6 bg-secondary/20 p-4 rounded-lg">
      {summary}
    </p>
  </div>
);

const ExperienceSection = ({ experience }: { experience: ExperienceItem[] }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <Briefcase className="w-4 h-4" />
      Work Experience
    </h3>
    <div className="pl-6 space-y-4">
      {experience.map((exp, idx) => (
        <div key={idx} className="bg-secondary/20 p-4 rounded-lg border-l-2 border-primary/30">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium text-foreground">{exp.title}</h4>
              <p className="text-sm text-primary">{exp.company}</p>
            </div>
            {exp.duration && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                {exp.duration}
              </span>
            )}
          </div>
          {exp.description && (
            <p className="text-sm text-muted-foreground mt-2">{exp.description}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

const EducationSection = ({ education }: { education: EducationItem[] }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <GraduationCap className="w-4 h-4" />
      Education
    </h3>
    <div className="pl-6 space-y-3">
      {education.map((edu, idx) => (
        <div key={idx} className="bg-secondary/20 p-4 rounded-lg border-l-2 border-primary/30">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium text-foreground">{edu.degree}</h4>
              <p className="text-sm text-primary">{edu.institution}</p>
            </div>
            {edu.year && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                {edu.year}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const SkillsSection = ({ skills }: { skills: string[] }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <Award className="w-4 h-4" />
      Skills
    </h3>
    <div className="pl-6 flex flex-wrap gap-2">
      {skills.map((skill, idx) => (
        <span 
          key={idx} 
          className="px-3 py-1.5 bg-primary/10 text-primary text-xs rounded-full font-medium"
        >
          {skill}
        </span>
      ))}
    </div>
  </div>
);

const CertificationsSection = ({ certifications }: { certifications: string[] }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <BadgeCheck className="w-4 h-4" />
      Certifications
    </h3>
    <div className="pl-6 space-y-2">
      {certifications.map((cert, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm text-foreground">
          <BadgeCheck className="w-4 h-4 text-green-500" />
          {cert}
        </div>
      ))}
    </div>
  </div>
);

const LanguagesSection = ({ languages }: { languages: string[] }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
      <Languages className="w-4 h-4" />
      Languages
    </h3>
    <div className="pl-6 flex flex-wrap gap-2">
      {languages.map((lang, idx) => (
        <span 
          key={idx} 
          className="px-3 py-1.5 bg-secondary/50 text-secondary-foreground text-xs rounded-full"
        >
          {lang}
        </span>
      ))}
    </div>
  </div>
);

const ResumePreviewDialog = ({
  open,
  onOpenChange,
  candidateName,
  candidateId,
  resumeText,
  resumeUrl,
  cachedParsedResume,
}: ResumePreviewDialogProps) => {
  const [copied, setCopied] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);

  // Load cached data or parse when dialog opens
  useEffect(() => {
    if (open && resumeText) {
      if (cachedParsedResume) {
        setParsedResume(cachedParsedResume);
      } else if (!parsedResume) {
        parseResumeWithAI();
      }
    }
  }, [open, resumeText, cachedParsedResume]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setParsedResume(null);
    }
  }, [open]);

  const saveParsedResume = useCallback(async (data: ParsedResume) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ parsed_resume: JSON.parse(JSON.stringify(data)) })
        .eq('id', candidateId);
      
      if (error) {
        console.error('Failed to save parsed resume:', error);
      }
    } catch (err) {
      console.error('Error saving parsed resume:', err);
    }
  }, [candidateId]);

  const parseResumeWithAI = useCallback(async () => {
    if (!resumeText) return;
    
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-resume-ai', {
        body: { resumeText }
      });

      if (error) {
        console.error('AI parsing error:', error);
        toast.error('Failed to parse resume with AI');
        return;
      }

      if (data?.parsedResume) {
        setParsedResume(data.parsedResume);
        // Save to database for caching
        await saveParsedResume(data.parsedResume);
        toast.success('Resume parsed and cached');
      }
    } catch (err) {
      console.error('Error parsing resume:', err);
      toast.error('Failed to parse resume');
    } finally {
      setParsing(false);
    }
  }, [resumeText, saveParsedResume]);

  const handleCopy = useCallback(() => {
    if (resumeText) {
      navigator.clipboard.writeText(resumeText);
      setCopied(true);
      toast.success('Resume content copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [resumeText]);

  const handleReparse = useCallback(() => {
    parseResumeWithAI();
  }, [parseResumeWithAI]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-xl font-semibold">{parsedResume?.name || candidateName}</span>
                <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                  {parsedResume?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {parsedResume.email}
                    </span>
                  )}
                  {parsedResume?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {parsedResume.phone}
                    </span>
                  )}
                  {parsedResume?.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {parsedResume.location}
                    </span>
                  )}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!resumeText}
              className="flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Text'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReparse}
              disabled={!resumeText || parsing}
              className="flex items-center gap-2"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {parsing ? 'Parsing...' : 'Re-parse with AI'}
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {parsing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Parsing resume with AI...</p>
            </div>
          ) : parsedResume ? (
            <div className="p-6 space-y-6">
              {parsedResume.summary && <SummarySection summary={parsedResume.summary} />}
              {parsedResume.experience?.length > 0 && <ExperienceSection experience={parsedResume.experience} />}
              {parsedResume.education?.length > 0 && <EducationSection education={parsedResume.education} />}
              {parsedResume.skills?.length > 0 && <SkillsSection skills={parsedResume.skills} />}
              {parsedResume.certifications?.length > 0 && <CertificationsSection certifications={parsedResume.certifications} />}
              {parsedResume.languages?.length > 0 && <LanguagesSection languages={parsedResume.languages} />}
            </div>
          ) : resumeText ? (
            <div className="p-6">
              <div className="bg-secondary/30 rounded-lg p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {resumeText}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No resume text available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Process the resume with AI to extract the content
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResumePreviewDialog;
