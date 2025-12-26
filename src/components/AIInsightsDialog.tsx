import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles, Target, TrendingUp, AlertTriangle, CheckCircle, Lightbulb, Briefcase, GraduationCap, MessageSquare, Users, Crosshair } from "lucide-react";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";

interface ScoreBreakdownItem {
  points?: number;
  justification?: string;
}

interface ScoreBreakdown {
  technical_skills?: ScoreBreakdownItem | number;
  experience_quality?: ScoreBreakdownItem | number;
  education_certifications?: ScoreBreakdownItem | number;
  communication_presentation?: ScoreBreakdownItem | number;
  cultural_fit?: ScoreBreakdownItem | number;
  job_match?: ScoreBreakdownItem | number;
  [key: string]: ScoreBreakdownItem | number | undefined;
}

interface AISkillsData {
  skills?: { name: string; level: string; years?: number }[];
  score_breakdown?: ScoreBreakdown;
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

interface AIInsightsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  jobTitle: string;
  aiScore: number | null;
  aiSummary: string | null;
  aiSkills: AISkillsData | null;
}

const AIInsightsDialog = ({
  open,
  onOpenChange,
  candidateName,
  jobTitle,
  aiScore,
  aiSummary,
  aiSkills,
}: AIInsightsDialogProps) => {
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-500';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-orange-500';
    return 'text-destructive';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500/10 border-emerald-500/30';
    if (score >= 70) return 'bg-primary/10 border-primary/30';
    if (score >= 50) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-destructive/10 border-destructive/30';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  // Parse aiSkills to get structured data
  const skillsData: AISkillsData | null = aiSkills;

  const scoreBreakdown = skillsData?.score_breakdown;
  const skills = skillsData?.skills || [];
  const strengths = skillsData?.strengths || [];
  const concerns = skillsData?.concerns || [];
  const redFlags = skillsData?.red_flags || [];
  const recommendations = skillsData?.recommendations || [];

  // Helper to get points from breakdown item (handles both old and new format)
  const getPoints = (item: ScoreBreakdownItem | number | undefined): number => {
    if (!item) return 0;
    if (typeof item === 'number') return item;
    return item.points || 0;
  };

  const getJustification = (item: ScoreBreakdownItem | number | undefined): string => {
    if (!item) return '';
    if (typeof item === 'number') return '';
    return item.justification || '';
  };

  const breakdownCategories = scoreBreakdown ? [
    { key: 'technical_skills', label: 'Technical Skills', maxPoints: 30, icon: Briefcase, color: 'text-blue-500' },
    { key: 'experience_quality', label: 'Experience Quality', maxPoints: 25, icon: TrendingUp, color: 'text-purple-500' },
    { key: 'education_certifications', label: 'Education & Certs', maxPoints: 15, icon: GraduationCap, color: 'text-green-500' },
    { key: 'communication_presentation', label: 'Communication', maxPoints: 10, icon: MessageSquare, color: 'text-yellow-500' },
    { key: 'cultural_fit', label: 'Cultural Fit', maxPoints: 10, icon: Users, color: 'text-pink-500' },
    { key: 'job_match', label: 'Job Match', maxPoints: 10, icon: Crosshair, color: 'text-cyan-500' },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <span>AI Insights</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Candidate Info */}
          <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
              {candidateName.split(' ').map(n => n[0]).join('').toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{candidateName}</h3>
              <p className="text-sm text-muted-foreground">{jobTitle}</p>
            </div>
          </div>

          {/* AI Score */}
          {aiScore !== null ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-6 rounded-xl border ${getScoreBgColor(aiScore)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className={`w-6 h-6 ${getScoreColor(aiScore)}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">Match Score</p>
                    <p className={`text-3xl font-bold ${getScoreColor(aiScore)}`}>{aiScore}%</p>
                  </div>
                </div>
                <Badge variant="secondary" className={`${getScoreBgColor(aiScore)} border`}>
                  {getScoreLabel(aiScore)}
                </Badge>
              </div>
              
              {/* Score bar */}
              <div className="mt-4">
                <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${aiScore}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      aiScore >= 85 ? 'bg-emerald-500' : 
                      aiScore >= 70 ? 'bg-primary' : 
                      aiScore >= 50 ? 'bg-orange-500' : 'bg-destructive'
                    }`}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="p-6 rounded-xl bg-secondary/30 border border-border text-center">
              <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">AI analysis not yet available</p>
              <p className="text-sm text-muted-foreground mt-1">Process the resume to generate insights</p>
            </div>
          )}

          {/* Score Breakdown */}
          {scoreBreakdown && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Target className="w-4 h-4 text-primary" />
                <span>Score Breakdown</span>
              </div>
              <div className="grid gap-3">
                {breakdownCategories.map((category, index) => {
                  const item = scoreBreakdown[category.key as keyof ScoreBreakdown];
                  const points = getPoints(item);
                  const justification = getJustification(item);
                  const percentage = (points / category.maxPoints) * 100;
                  const Icon = category.icon;
                  
                  return (
                    <motion.div
                      key={category.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + index * 0.05 }}
                      className="p-3 bg-secondary/30 rounded-lg border border-border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${category.color}`} />
                          <span className="text-sm font-medium text-foreground">{category.label}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground">
                          {points}/{category.maxPoints}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: 0.2 + index * 0.05 }}
                          className={`h-full rounded-full ${
                            percentage >= 80 ? 'bg-emerald-500' : 
                            percentage >= 60 ? 'bg-primary' : 
                            percentage >= 40 ? 'bg-orange-500' : 'bg-destructive'
                          }`}
                        />
                      </div>
                      {justification && (
                        <p className="text-xs text-muted-foreground">{justification}</p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* AI Summary */}
          {aiSummary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span>Summary & Justification</span>
              </div>
              <div className="p-4 bg-secondary/30 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {aiSummary}
                </p>
              </div>
            </motion.div>
          )}

          {/* Strengths */}
          {strengths.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>Key Strengths</span>
              </div>
              <div className="p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                <ul className="space-y-2">
                  {strengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Concerns & Red Flags */}
          {(concerns.length > 0 || redFlags.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span>Areas of Concern</span>
              </div>
              <div className="p-4 bg-orange-500/5 rounded-lg border border-orange-500/20">
                <ul className="space-y-2">
                  {concerns.map((concern, index) => (
                    <li key={`concern-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                      {concern}
                    </li>
                  ))}
                  {redFlags.map((flag, index) => (
                    <li key={`flag-${index}`} className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <span>Recommendations</span>
              </div>
              <div className="p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                <ul className="space-y-2">
                  {recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Identified Skills</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, index) => {
                  const skillName = typeof skill === 'string' ? skill : skill.name;
                  const skillLevel = typeof skill === 'string' ? 'intermediate' : skill.level;
                  
                  const levelColors: Record<string, string> = {
                    beginner: 'bg-muted text-muted-foreground border-muted',
                    intermediate: 'bg-primary/10 text-primary border-primary/20',
                    advanced: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                    expert: 'bg-accent/10 text-accent border-accent/20',
                  };
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45 + index * 0.03 }}
                    >
                      <Badge 
                        variant="secondary" 
                        className={`${levelColors[skillLevel] || levelColors.intermediate} border hover:opacity-80 transition-opacity`}
                      >
                        {skillName}
                        {skillLevel && skillLevel !== 'intermediate' && (
                          <span className="ml-1 opacity-70">• {skillLevel}</span>
                        )}
                      </Badge>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* No insights message */}
          {aiScore === null && !aiSummary && skills.length === 0 && (
            <div className="text-center py-8">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No AI insights available yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click the sparkle icon on the candidate row to process their resume
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIInsightsDialog;
