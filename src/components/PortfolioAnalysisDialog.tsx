import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Github, Globe, Star, GitFork, Users, Code2, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

interface PortfolioAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  existingGithubUrl?: string | null;
  existingPortfolioUrl?: string | null;
  existingAnalysis?: PortfolioAnalysis | null;
  onAnalysisComplete?: () => void;
}

const skillLevelColors: Record<string, string> = {
  beginner: "bg-yellow-500/20 text-yellow-700 border-yellow-500/30",
  intermediate: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  advanced: "bg-purple-500/20 text-purple-700 border-purple-500/30",
  expert: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
};

const recommendationConfig: Record<string, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  strongly_recommend: { color: "text-emerald-600", label: "Strongly Recommend", icon: CheckCircle2 },
  recommend: { color: "text-blue-600", label: "Recommend", icon: CheckCircle2 },
  consider: { color: "text-yellow-600", label: "Consider", icon: AlertTriangle },
  not_recommended: { color: "text-red-600", label: "Not Recommended", icon: AlertTriangle },
};

export default function PortfolioAnalysisDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  existingGithubUrl,
  existingPortfolioUrl,
  existingAnalysis,
  onAnalysisComplete,
}: PortfolioAnalysisDialogProps) {
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);

  // Sync state with props when dialog opens or candidate changes
  useEffect(() => {
    if (open) {
      setGithubUrl(existingGithubUrl || "");
      setPortfolioUrl(existingPortfolioUrl || "");
      setAnalysis(existingAnalysis || null);
    }
  }, [open, existingGithubUrl, existingPortfolioUrl, existingAnalysis]);

  const handleAnalyze = async () => {
    if (!githubUrl && !portfolioUrl) {
      toast.error("Please provide at least a GitHub URL");
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-portfolio', {
        body: { candidateId, githubUrl, portfolioUrl }
      });

      if (error) throw error;

      if (data.analysis) {
        setAnalysis(data.analysis);
        toast.success("Portfolio analysis complete!");
        onAnalysisComplete?.();
      }
    } catch (error) {
      console.error("Error analyzing portfolio:", error);
      toast.error("Failed to analyze portfolio. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const RecIcon = analysis ? recommendationConfig[analysis.recommendation]?.icon || CheckCircle2 : CheckCircle2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Portfolio Analysis - {candidateName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input Section */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="github" className="flex items-center gap-2">
                <Github className="w-4 h-4" />
                GitHub Profile URL
              </Label>
              <Input
                id="github"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Portfolio Website (optional)
              </Label>
              <Input
                id="portfolio"
                placeholder="https://portfolio.com"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
              />
            </div>
            <Button onClick={handleAnalyze} disabled={isAnalyzing || (!githubUrl && !portfolioUrl)}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {analysis ? "Re-analyze" : "Analyze Portfolio"}
                </>
              )}
            </Button>
          </div>

          {/* Analysis Results */}
          {analysis && (
            <div className="space-y-4 pt-4 border-t">
              {/* Summary Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Analysis Summary</span>
                    <Badge className={skillLevelColors[analysis.skill_level] || ""}>
                      {analysis.skill_level.charAt(0).toUpperCase() + analysis.skill_level.slice(1)} Level
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                  
                  <div className={`flex items-center gap-2 ${recommendationConfig[analysis.recommendation]?.color || ""}`}>
                    <RecIcon className="w-5 h-5" />
                    <span className="font-medium">
                      {recommendationConfig[analysis.recommendation]?.label || analysis.recommendation}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* GitHub Stats */}
              {analysis.github_stats && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Github className="w-4 h-4" />
                      GitHub Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-6 text-sm">
                      <div className="flex items-center gap-1">
                        <Code2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{analysis.github_stats.public_repos}</span>
                        <span className="text-muted-foreground">repos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{analysis.github_stats.followers}</span>
                        <span className="text-muted-foreground">followers</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Technologies */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Primary Languages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.primary_languages.map((lang) => (
                        <Badge key={lang} variant="secondary" className="text-xs">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Technologies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.technologies.map((tech) => (
                        <Badge key={tech} variant="outline" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Strengths & Concerns */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      {analysis.strengths.map((strength, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-500 mt-1">•</span>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {analysis.concerns && analysis.concerns.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        Concerns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-sm space-y-1">
                        {analysis.concerns.map((concern, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-500 mt-1">•</span>
                            {concern}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Project Highlights */}
              {analysis.project_highlights && analysis.project_highlights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      Project Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      {analysis.project_highlights.map((project, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          {project}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <p className="text-xs text-muted-foreground text-right">
                Analyzed: {new Date(analysis.analyzed_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
