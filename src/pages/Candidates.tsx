import { useState } from 'react';
import { Search, Filter, MoreHorizontal, Mail, Phone, FileText, Sparkles, Loader2, Brain, Copy, Check, Github } from 'lucide-react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProcessApplication } from "@/hooks/useProcessApplication";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AIInsightsDialog from "@/components/AIInsightsDialog";
import ResumePreviewDialog from "@/components/ResumePreviewDialog";
import PortfolioAnalysisDialog from "@/components/PortfolioAnalysisDialog";
import type { Json } from "@/integrations/supabase/types";

interface ParsedResume {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experience: { title: string; company: string; duration?: string; description?: string }[];
  education: { degree: string; institution: string; year?: string }[];
  skills: string[];
  certifications: string[];
  languages: string[];
}

interface PortfolioAnalysis {
  skill_level: string;
  primary_languages: string[];
  technologies: string[];
  strengths: string[];
  concerns?: string[];
  project_highlights?: string[];
  recommendation: string;
  summary: string;
  github_stats?: {
    username: string;
    public_repos: number;
    followers: number;
    profile_url: string;
  };
  analyzed_at: string;
}

interface AISkillsData {
  skills?: { name: string; level: string; years?: number }[];
  score_breakdown?: Record<string, any>;
  strengths?: string[];
  concerns?: string[];
  red_flags?: string[];
  recommendations?: string[];
  experience_years?: number;
  current_role?: string;
  current_company?: string;
  education_level?: string;
  interview_questions?: string[];
}

interface Application {
  id: string;
  candidateId: string;
  candidateName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  aiScore: number | null;
  aiSummary: string | null;
  aiSkills: AISkillsData | null;
  status: string;
  appliedDate: string;
  hasResume: boolean;
  resumeUrl: string | null;
  resumeText: string | null;
  parsedResume: ParsedResume | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  portfolioAnalysis: PortfolioAnalysis | null;
}

const statusColors: Record<string, string> = {
  applied: 'bg-muted text-muted-foreground',
  screening: 'bg-primary/20 text-primary border border-primary/30',
  interview: 'bg-accent/20 text-accent border border-accent/30',
  offer: 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30',
  hired: 'bg-green-600/20 text-green-600 border border-green-600/30',
  rejected: 'bg-destructive/20 text-destructive border border-destructive/30',
};

const APPLICATION_STATUSES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
] as const;

const Candidates = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [candidateToReject, setCandidateToReject] = useState<{ id: string; name: string } | null>(null);
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false);
  const [selectedInsights, setSelectedInsights] = useState<Application | null>(null);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Application | null>(null);
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Application | null>(null);
  const { loading: authLoading } = useAuth(true);
  const processApplication = useProcessApplication();
  const queryClient = useQueryClient();

  const { data: applications, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async (): Promise<Application[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          ai_score,
          ai_summary,
          ai_skills,
          status,
          created_at,
          candidates!inner(id, full_name, email, phone, resume_text, resume_url, parsed_resume, github_url, portfolio_url, portfolio_analysis),
          jobs!inner(title)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const parseAiSkills = (skills: Json | null): AISkillsData | null => {
        if (!skills) return null;
        if (typeof skills === 'object' && !Array.isArray(skills)) {
          return skills as unknown as AISkillsData;
        }
        // Handle legacy array format
        if (Array.isArray(skills)) {
          return {
            skills: skills.filter((s): s is { name: string; level: string } => 
              typeof s === 'object' && s !== null && 'name' in s
            ).length > 0 
              ? skills.filter((s): s is { name: string; level: string } => 
                  typeof s === 'object' && s !== null && 'name' in s
                )
              : skills.filter((s): s is string => typeof s === 'string').map(name => ({ name, level: 'intermediate' }))
          };
        }
        return null;
      };

      const parseParsedResume = (data: Json | null): ParsedResume | null => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return data as unknown as ParsedResume;
      };

      const parsePortfolioAnalysis = (data: Json | null): PortfolioAnalysis | null => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return data as unknown as PortfolioAnalysis;
      };

      return (data || []).map((app: any) => ({
        id: app.id,
        candidateId: app.candidates.id,
        candidateName: app.candidates.full_name,
        email: app.candidates.email,
        phone: app.candidates.phone,
        jobTitle: app.jobs.title,
        aiScore: app.ai_score,
        aiSummary: app.ai_summary,
        aiSkills: parseAiSkills(app.ai_skills),
        status: app.status,
        appliedDate: app.created_at,
        hasResume: !!app.candidates.resume_text || !!app.candidates.resume_url,
        resumeUrl: app.candidates.resume_url,
        resumeText: app.candidates.resume_text,
        parsedResume: parseParsedResume(app.candidates.parsed_resume),
        githubUrl: app.candidates.github_url,
        portfolioUrl: app.candidates.portfolio_url,
        portfolioAnalysis: parsePortfolioAnalysis(app.candidates.portfolio_analysis),
      }));
    },
    enabled: !authLoading,
  });

  // Update application status mutation
  const updateStatus = useMutation({
    mutationFn: async ({ applicationId, status }: { applicationId: string; status: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' }) => {
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', applicationId);

      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      const statusLabel = status === 'rejected' ? 'rejected' : `moved to ${status}`;
      toast.success(`Application ${statusLabel}`);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['recent-applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const handleRejectClick = (candidateId: string, candidateName: string) => {
    setCandidateToReject({ id: candidateId, name: candidateName });
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (candidateToReject) {
      updateStatus.mutate({ applicationId: candidateToReject.id, status: 'rejected' });
    }
    setRejectDialogOpen(false);
    setCandidateToReject(null);
  };

  const handleViewInsights = (candidate: Application) => {
    setSelectedInsights(candidate);
    setInsightsDialogOpen(true);
  };

  // Bulk process mutation
  const bulkProcess = useMutation({
    mutationFn: async (applicationIds: string[]) => {
      const results: Array<{
        applicationId: string;
        success: boolean;
        data?: any;
        error?: any;
      }> = [];

      for (const applicationId of applicationIds) {
        try {
          const { data, error } = await supabase.functions.invoke('auto-process-application', {
            body: { applicationId },
          });

          if (error) {
            const status = (error as any)?.context?.status;
            if (status === 429) {
              toast.error('Rate limit reached. Pausing bulk processing.');
              results.push({ applicationId, success: false, error });
              break;
            }

            results.push({ applicationId, success: false, error });
          } else {
            results.push({ applicationId, success: true, data });
          }

          // Small delay between requests to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          results.push({ applicationId, success: false, error });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (successful > 0) {
        toast.success(`Processed ${successful} resume(s) successfully`);
      }
      if (failed > 0) {
        toast.error(`Failed to process ${failed} resume(s)`);
      }
      
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['recent-applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: Error) => {
      toast.error(`Bulk processing failed: ${error.message}`);
    },
  });

  const filteredCandidates = (applications || []).filter(c => 
    c.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleProcessResume = (applicationId: string) => {
    processApplication.mutate(applicationId);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCandidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map(c => c.id)));
    }
  };

  const handleBulkProcess = () => {
    const toProcess = filteredCandidates
      .filter(c => selectedIds.has(c.id) && c.hasResume)
      .map(c => c.id);
    
    if (toProcess.length === 0) {
      toast.error('No candidates with resumes selected');
      return;
    }
    
    bulkProcess.mutate(toProcess);
  };

  const selectedWithResume = filteredCandidates.filter(
    c => selectedIds.has(c.id) && c.hasResume
  ).length;

  return (
    <DashboardLayout>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Candidates</h1>
            <p className="text-muted-foreground mt-2">Manage and track all applicants</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button 
                onClick={handleBulkProcess}
                disabled={bulkProcess.isPending || selectedWithResume === 0}
                className="flex items-center gap-2"
              >
                {bulkProcess.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                AI Process ({selectedWithResume})
              </Button>
            )}
            <Button>
              Add Candidate
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder-muted-foreground"
            />
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>

        {/* Candidates Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-4">
                      <Checkbox
                        checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Candidate</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Score</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Applied</th>
                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCandidates.map((candidate, index) => (
                    <motion.tr 
                      key={candidate.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`group hover:bg-secondary/30 transition-colors ${selectedIds.has(candidate.id) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedIds.has(candidate.id)}
                          onCheckedChange={() => toggleSelection(candidate.id)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                            {candidate.candidateName.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-foreground block">{candidate.candidateName}</span>
                            <span className="text-sm text-muted-foreground">{candidate.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{candidate.jobTitle}</td>
                      <td className="px-6 py-4">
                        {candidate.aiScore !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${candidate.aiScore >= 85 ? 'bg-emerald-500' : candidate.aiScore >= 70 ? 'bg-primary' : 'bg-orange-500'}`}
                                style={{ width: `${candidate.aiScore}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-foreground">{candidate.aiScore}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[candidate.status] || statusColors.applied}`}>
                          {formatStatus(candidate.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-sm">
                        {new Date(candidate.appliedDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {candidate.hasResume && (
                            <button 
                              onClick={() => handleProcessResume(candidate.id)}
                              disabled={processApplication.isPending}
                              className="p-2 hover:bg-primary/20 rounded-lg transition-colors" 
                              title="AI Process Resume"
                            >
                              {processApplication.isPending ? (
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4 text-primary" />
                              )}
                            </button>
                          )}
                          {(candidate.aiScore !== null || candidate.aiSummary || candidate.aiSkills) && (
                            <button 
                              onClick={() => handleViewInsights(candidate)}
                              className="p-2 hover:bg-accent/20 rounded-lg transition-colors" 
                              title="View AI Insights"
                            >
                              <Brain className="w-4 h-4 text-accent" />
                            </button>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(candidate.email);
                                    toast.success('Email copied to clipboard');
                                  }}
                                  className="p-2 hover:bg-secondary rounded-lg transition-colors" 
                                >
                                  <Mail className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="flex items-center gap-2">
                                <span>{candidate.email}</span>
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button 
                                  onClick={() => {
                                    if (candidate.phone) {
                                      navigator.clipboard.writeText(candidate.phone);
                                      toast.success('Phone copied to clipboard');
                                    } else {
                                      toast.info('No phone number available');
                                    }
                                  }}
                                  className="p-2 hover:bg-secondary rounded-lg transition-colors" 
                                >
                                  <Phone className={`w-4 h-4 ${candidate.phone ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50'}`} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="flex items-center gap-2">
                                <span>{candidate.phone || 'No phone'}</span>
                                {candidate.phone && <Copy className="w-3 h-3 text-muted-foreground" />}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {candidate.hasResume && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button 
                                    onClick={() => {
                                      setSelectedResume(candidate);
                                      setResumeDialogOpen(true);
                                    }}
                                    className="p-2 hover:bg-secondary rounded-lg transition-colors" 
                                  >
                                    <FileText className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <span>View Resume</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-secondary rounded-lg transition-colors" title="More">
                                <MoreHorizontal className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem onClick={() => handleViewInsights(candidate)}>
                                <Brain className="w-4 h-4 mr-2" />
                                View AI Insights
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedPortfolio(candidate);
                                setPortfolioDialogOpen(true);
                              }}>
                                <Github className="w-4 h-4 mr-2" />
                                Analyze Portfolio
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleProcessResume(candidate.id)}>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Re-process with AI
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem>Schedule Interview</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Change Status</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="bg-popover">
                                  {APPLICATION_STATUSES.filter(s => s.value !== candidate.status).map((status) => (
                                    <DropdownMenuItem
                                      key={status.value}
                                      onClick={() => updateStatus.mutate({ applicationId: candidate.id, status: status.value })}
                                    >
                                      <span className={`w-2 h-2 rounded-full mr-2 ${statusColors[status.value]?.split(' ')[0] || 'bg-muted'}`} />
                                      {status.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleRejectClick(candidate.id, candidate.candidateName)}
                              >
                                Reject Application
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                  {filteredCandidates.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        No candidates found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </motion.div>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject {candidateToReject?.name}'s application? This action can be undone by changing the status later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Insights Dialog */}
      <AIInsightsDialog
        open={insightsDialogOpen}
        onOpenChange={setInsightsDialogOpen}
        candidateName={selectedInsights?.candidateName || ''}
        jobTitle={selectedInsights?.jobTitle || ''}
        aiScore={selectedInsights?.aiScore ?? null}
        aiSummary={selectedInsights?.aiSummary ?? null}
        aiSkills={selectedInsights?.aiSkills ?? null}
      />

      {/* Resume Preview Dialog */}
      <ResumePreviewDialog
        open={resumeDialogOpen}
        onOpenChange={setResumeDialogOpen}
        candidateName={selectedResume?.candidateName || ''}
        candidateId={selectedResume?.candidateId || ''}
        resumeText={selectedResume?.resumeText ?? null}
        resumeUrl={selectedResume?.resumeUrl ?? null}
        cachedParsedResume={selectedResume?.parsedResume ?? null}
      />

      {/* Portfolio Analysis Dialog */}
      <PortfolioAnalysisDialog
        open={portfolioDialogOpen}
        onOpenChange={setPortfolioDialogOpen}
        candidateId={selectedPortfolio?.candidateId || ''}
        candidateName={selectedPortfolio?.candidateName || ''}
        existingGithubUrl={selectedPortfolio?.githubUrl}
        existingPortfolioUrl={selectedPortfolio?.portfolioUrl}
        existingAnalysis={selectedPortfolio?.portfolioAnalysis}
        onAnalysisComplete={() => queryClient.invalidateQueries({ queryKey: ['applications'] })}
      />
    </DashboardLayout>
  );
};

export default Candidates;