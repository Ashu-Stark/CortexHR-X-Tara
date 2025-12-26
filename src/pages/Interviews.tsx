import { Video, Calendar, Clock, ExternalLink, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ScheduleInterviewDialog } from "@/components/ScheduleInterviewDialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Interview {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: string;
  status: string;
  meeting_url: string | null;
  application: {
    candidate: {
      full_name: string;
    };
    job: {
      title: string;
    };
  };
}

const Interviews = () => {
  const queryClient = useQueryClient();

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['interviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interviews')
        .select(`
          id,
          scheduled_at,
          duration_minutes,
          interview_type,
          status,
          meeting_url,
          application_id,
          applications:application_id (
            candidate_id,
            job_id,
            candidates:candidate_id (
              full_name
            ),
            jobs:job_id (
              title
            )
          )
        `)
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error fetching interviews:', error);
        throw error;
      }

      console.log('Fetched interviews:', data);

      return (data || []).map((interview: any) => ({
        id: interview.id,
        scheduled_at: interview.scheduled_at,
        duration_minutes: interview.duration_minutes,
        interview_type: interview.interview_type,
        status: interview.status,
        meeting_url: interview.meeting_url,
        application: {
          candidate: {
            full_name: interview.applications?.candidates?.full_name || 'Unknown'
          },
          job: {
            title: interview.applications?.jobs?.title || 'Unknown Position'
          }
        }
      }));
    },
  });

  const cancelInterview = useMutation({
    mutationFn: async (interviewId: string) => {
      const { error } = await supabase
        .from('interviews')
        .update({ status: 'cancelled' })
        .eq('id', interviewId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Interview cancelled');
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel interview');
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayInterviews = (interviews || []).filter((i: Interview) => {
    const date = new Date(i.scheduled_at);
    return date >= today && date < tomorrow && i.status !== 'cancelled';
  });

  const upcomingInterviews = (interviews || []).filter((i: Interview) => {
    const date = new Date(i.scheduled_at);
    return date >= tomorrow && i.status !== 'cancelled';
  });

  const pastInterviews = (interviews || []).filter((i: Interview) => {
    const date = new Date(i.scheduled_at);
    return date < today && i.status !== 'cancelled';
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

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
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Interviews</h1>
            <p className="text-muted-foreground mt-2">Schedule and manage video interviews</p>
          </div>
          <ScheduleInterviewDialog />
        </div>

        {/* Today's Interviews */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Today's Interviews
          </h2>
          {todayInterviews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todayInterviews.map((interview: Interview, index: number) => (
                <motion.div
                  key={interview.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-card rounded-xl border border-border p-6 hover:border-primary/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                        {interview.application.candidate.full_name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{interview.application.candidate.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{interview.application.job.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent border border-accent/30">
                        {interview.interview_type}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-secondary rounded">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => cancelInterview.mutate(interview.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Cancel Interview
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {format(new Date(interview.scheduled_at), 'h:mm a')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {interview.duration_minutes} min
                    </span>
                  </div>

                  <Button 
                    className="w-full group-hover:glow-button" 
                    variant="default"
                    onClick={() => interview.meeting_url && window.open(interview.meeting_url, '_blank')}
                    disabled={!interview.meeting_url}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {interview.meeting_url ? 'Join Meeting' : 'No Meeting Link'}
                    {interview.meeting_url && <ExternalLink className="w-4 h-4 ml-2" />}
                  </Button>
                </motion.div>
              ))}
            </div>
          ) : (
             <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-xl border border-dashed border-border">
               No interviews scheduled for today
             </div>
          )}
        </div>

        {/* Upcoming Interviews */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-4">
            Upcoming
          </h2>
          {upcomingInterviews.length > 0 ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {upcomingInterviews.map((interview: Interview, index: number) => (
                  <motion.div
                    key={interview.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-secondary/30 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {interview.application.candidate.full_name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{interview.application.candidate.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{interview.application.job.title} · {interview.interview_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {format(new Date(interview.scheduled_at), 'MMM d, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(interview.scheduled_at), 'h:mm a')} · {interview.duration_minutes} min
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {interview.meeting_url && (
                            <DropdownMenuItem onClick={() => window.open(interview.meeting_url!, '_blank')}>
                              <Video className="w-4 h-4 mr-2" />
                              Join Meeting
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => cancelInterview.mutate(interview.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-xl border border-dashed border-border">
              No upcoming interviews scheduled
            </div>
          )}
        </div>

        {/* Past Interviews */}
        {pastInterviews.length > 0 && (
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-4">
              Past Interviews
            </h2>
            <div className="bg-card rounded-xl border border-border overflow-hidden opacity-75">
              <div className="divide-y divide-border">
                {pastInterviews.slice(0, 5).map((interview: Interview) => (
                  <div
                    key={interview.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {interview.application.candidate.full_name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{interview.application.candidate.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{interview.application.job.title}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(interview.scheduled_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default Interviews;
