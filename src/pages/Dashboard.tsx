import { Users, UserCheck, Clock, Calendar, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DashboardStats {
  totalCandidates: number;
  toScreen: number;
  interviewsToday: number;
  avgTimeToHire: string;
}

interface RecentApplication {
  id: string;
  candidateName: string;
  initials: string;
  jobTitle: string;
  aiScore: number | null;
  status: string;
}

const Dashboard = () => {
  const { loading: authLoading, isHrStaff } = useAuth(true);

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const [candidatesRes, applicationsRes, interviewsRes] = await Promise.all([
        supabase.from('candidates').select('id', { count: 'exact', head: true }),
        supabase.from('applications').select('status'),
        supabase.from('interviews').select('scheduled_at').gte('scheduled_at', new Date().toISOString().split('T')[0]).lt('scheduled_at', new Date(Date.now() + 86400000).toISOString().split('T')[0]),
      ]);

      const toScreen = applicationsRes.data?.filter(a => a.status === 'applied' || a.status === 'screening').length || 0;

      return {
        totalCandidates: candidatesRes.count || 0,
        toScreen,
        interviewsToday: interviewsRes.data?.length || 0,
        avgTimeToHire: '12d', // Would need hired_at date to calculate
      };
    },
    enabled: !authLoading && isHrStaff,
  });

  // Fetch recent applications with candidate and job info
  const { data: recentApplications, isLoading: applicationsLoading } = useQuery({
    queryKey: ['recent-applications'],
    queryFn: async (): Promise<RecentApplication[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          ai_score,
          status,
          candidates!inner(full_name),
          jobs!inner(title)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data || []).map((app: any) => ({
        id: app.id,
        candidateName: app.candidates.full_name,
        initials: app.candidates.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        jobTitle: app.jobs.title,
        aiScore: app.ai_score,
        status: app.status,
      }));
    },
    enabled: !authLoading && isHrStaff,
  });

  // Fetch pending actions counts
  const { data: actionCounts } = useQuery({
    queryKey: ['action-counts'],
    queryFn: async () => {
      const [appliedRes, offerRes, pendingInterviewsRes] = await Promise.all([
        supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
        supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'offer'),
        supabase.from('applications').select('id', { count: 'exact', head: true }).in('status', ['screening', 'interview']),
      ]);

      return {
        toScreen: appliedRes.count || 0,
        offersPending: offerRes.count || 0,
        interviewsPending: pendingInterviewsRes.count || 0,
      };
    },
    enabled: !authLoading && isHrStaff,
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'primary':
        return { bg: 'bg-primary/10', text: 'text-primary' };
      case 'accent':
        return { bg: 'bg-accent/10', text: 'text-accent' };
      case 'pink':
        return { bg: 'bg-pink-500/10', text: 'text-pink-500' };
      case 'orange':
        return { bg: 'bg-orange-500/10', text: 'text-orange-500' };
      default:
        return { bg: 'bg-primary/10', text: 'text-primary' };
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const statsData = [
    { title: 'Total Candidates', value: statsLoading ? '...' : String(stats?.totalCandidates || 0), icon: Users, color: 'primary' },
    { title: 'To Screen', value: statsLoading ? '...' : String(stats?.toScreen || 0), icon: UserCheck, color: 'accent' },
    { title: 'Interviews Today', value: statsLoading ? '...' : String(stats?.interviewsToday || 0), icon: Calendar, color: 'pink' },
    { title: 'Avg Time to Hire', value: stats?.avgTimeToHire || '12d', icon: Clock, color: 'orange' },
  ];

  return (
    <DashboardLayout>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-2">Welcome back. Here's your daily overview.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsData.map((stat, index) => {
            const Icon = stat.icon;
            const colors = getColorClasses(stat.color);
            
            return (
              <motion.div 
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-card p-6 rounded-xl border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                    <h3 className="text-2xl font-display font-bold text-foreground mt-2 group-hover:text-primary transition-colors">{stat.value}</h3>
                  </div>
                  <div className={`p-3 rounded-lg ${colors.bg} group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Recent Activity / Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Candidates Table Preview */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden"
          >
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-display font-bold text-foreground">Recent Applications</h2>
              <Link to="/dashboard/candidates" className="text-sm text-primary font-medium hover:text-primary/80 transition-colors">
                View All
              </Link>
            </div>
            <div className="overflow-x-auto">
              {applicationsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Candidate</th>
                      <th className="px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Score</th>
                      <th className="px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentApplications?.map((candidate) => (
                      <tr key={candidate.id} className="group hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                              {candidate.initials}
                            </div>
                            <span className="font-medium text-foreground">{candidate.candidateName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-sm">{candidate.jobTitle}</td>
                        <td className="px-6 py-4">
                          {candidate.aiScore !== null ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              candidate.aiScore >= 85 
                                ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                                : candidate.aiScore >= 70
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}>
                              {candidate.aiScore}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-muted-foreground">{formatStatus(candidate.status)}</span>
                        </td>
                      </tr>
                    ))}
                    {(!recentApplications || recentApplications.length === 0) && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                          No recent applications
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>

          {/* AI Action Center */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-gradient-to-br from-card to-secondary rounded-xl border border-border p-6"
          >
            <h2 className="text-lg font-display font-bold text-foreground mb-1">AI Action Center</h2>
            <p className="text-muted-foreground text-sm mb-6">Automated tasks pending your review.</p>
            <div className="space-y-3">
              <Link to="/dashboard/candidates" className="w-full bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/30 p-4 rounded-lg text-left transition-all group block">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">Screen Resumes</span>
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{actionCounts?.toScreen || 0}</span>
                </div>
                <div className="text-xs text-muted-foreground">New applications to process</div>
              </Link>
              <Link to="/dashboard/candidates" className="w-full bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/30 p-4 rounded-lg text-left transition-all group block">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">Offer Letters</span>
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">{actionCounts?.offersPending || 0}</span>
                </div>
                <div className="text-xs text-muted-foreground">Ready for final approval</div>
              </Link>
              <Link to="/dashboard/interviews" className="w-full bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/30 p-4 rounded-lg text-left transition-all group block">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">Interviews</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{actionCounts?.interviewsPending || 0}</span>
                </div>
                <div className="text-xs text-muted-foreground">Candidates in interview pipeline</div>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Dashboard;