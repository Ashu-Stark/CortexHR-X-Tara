import { useState } from 'react';
import { Loader2, Sparkles, Copy, Check, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Question {
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  followUp?: string;
  expectedInsights?: string;
}

interface AIInterviewQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
}

const difficultyColors = {
  easy: 'bg-emerald-500/20 text-emerald-500',
  medium: 'bg-amber-500/20 text-amber-500',
  hard: 'bg-red-500/20 text-red-500',
};

export function AIInterviewQuestionsDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  jobTitle,
}: AIInterviewQuestionsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [interviewType, setInterviewType] = useState('Technical');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateQuestions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-interview-questions', {
        body: {
          applicationId,
          interviewType,
          numberOfQuestions,
        },
      });

      if (error) {
        if ((error as any)?.context?.status === 429) {
          toast.error('Rate limit reached. Please try again in a moment.');
          return;
        }
        throw error;
      }

      setQuestions(data.questions || []);
      toast.success(`Generated ${data.questions?.length || 0} questions`);
    } catch (error: any) {
      toast.error(`Failed to generate questions: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyQuestion = (index: number) => {
    const q = questions[index];
    const text = `${q.question}${q.followUp ? `\n\nFollow-up: ${q.followUp}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllQuestions = () => {
    const text = questions
      .map((q, i) => `${i + 1}. ${q.question}${q.followUp ? `\n   Follow-up: ${q.followUp}` : ''}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('All questions copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Interview Questions
          </DialogTitle>
          <DialogDescription>
            Generate personalized interview questions for {candidateName} ({jobTitle})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Settings */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium text-foreground">Interview Type</label>
              <Select value={interviewType} onValueChange={setInterviewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Behavioral">Behavioral</SelectItem>
                  <SelectItem value="HR Screen">HR Screen</SelectItem>
                  <SelectItem value="Final">Final Round</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-2">
              <label className="text-sm font-medium text-foreground">Questions</label>
              <Select
                value={numberOfQuestions.toString()}
                onValueChange={(v) => setNumberOfQuestions(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="7">7</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={generateQuestions} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : questions.length > 0 ? (
                  <RefreshCw className="w-4 h-4 mr-2" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {questions.length > 0 ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
          </div>

          {/* Questions List */}
          {questions.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-foreground">
                  {questions.length} {interviewType} Questions
                </h3>
                <Button variant="outline" size="sm" onClick={copyAllQuestions}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All
                </Button>
              </div>

              <div className="space-y-3">
                {questions.map((q, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            Q{index + 1}
                          </span>
                          <Badge className={difficultyColors[q.difficulty]}>
                            {q.difficulty}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {q.category}
                          </Badge>
                        </div>
                        <p className="text-foreground font-medium">{q.question}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyQuestion(index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {q.followUp && (
                      <div className="pl-4 border-l-2 border-primary/30">
                        <span className="text-xs text-muted-foreground">Follow-up:</span>
                        <p className="text-sm text-foreground">{q.followUp}</p>
                      </div>
                    )}

                    {q.expectedInsights && (
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
                        <span className="font-medium">Look for:</span> {q.expectedInsights}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {questions.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Click "Generate" to create personalized interview questions</p>
              <p className="text-sm mt-1">
                Questions will be based on the candidate's resume and job requirements
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-muted-foreground">Generating personalized questions...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
