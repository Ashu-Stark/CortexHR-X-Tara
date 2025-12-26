import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useProcessApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('auto-process-application', {
        body: { applicationId },
      });

      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (status === 402) {
          throw new Error('AI credits exhausted. Please add funds.');
        }
        throw new Error(error.message || 'Failed to process resume');
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success(`Resume processed! AI Score: ${data.analysis?.score || 'N/A'}%`);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['recent-applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: Error) => {
      console.error('Processing error:', error);
      if (error.message.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Please try again in a moment.');
      } else if (error.message.includes('credits')) {
        toast.error('AI credits exhausted. Please add funds.');
      } else {
        toast.error(`Failed to process resume: ${error.message}`);
      }
    },
  });
}