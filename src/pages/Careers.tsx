import { useState } from 'react';
import { Link } from "react-router-dom";
import { ArrowLeft, Briefcase, MapPin, Clock, X, Upload, CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  job_type: string;
  description: string | null;
  requirements: string | null;
}

const Careers = () => {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    resume: null as File | null
  });

  // Fetch real jobs from database
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['public-jobs'],
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, department, location, job_type, description, requirements')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Submit application mutation
  const submitApplication = useMutation({
    mutationFn: async () => {
      if (!formData.resume || !selectedJob) {
        throw new Error('Missing required fields');
      }

      // Upload resume to storage
      const fileExt = formData.resume.name.split('.').pop();
      const fileName = `${Date.now()}-${formData.name.replace(/\s+/g, '_')}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, formData.resume);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Failed to upload resume');
      }

      // Store the file path (not URL) so backend can download from storage
      // Create candidate record
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          full_name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          resume_url: fileName, // Store path, not public URL
        })
        .select()
        .single();

      if (candidateError) {
        // Check if candidate already exists
        if (candidateError.code === '23505') {
          // Get existing candidate
          const { data: existingCandidate, error: fetchError } = await supabase
            .from('candidates')
            .select('id')
            .eq('email', formData.email)
            .single();

          if (fetchError || !existingCandidate) {
            throw new Error('Failed to find existing candidate');
          }

          // Create application for existing candidate
          const { error: appError } = await supabase
            .from('applications')
            .insert({
              candidate_id: existingCandidate.id,
              job_id: selectedJob.id,
              status: 'applied',
            });

          if (appError) {
            if (appError.code === '23505') {
              throw new Error('You have already applied for this position');
            }
            throw appError;
          }

          return { success: true };
        }
        throw candidateError;
      }

      // Create application
      const { error: applicationError } = await supabase
        .from('applications')
        .insert({
          candidate_id: candidate.id,
          job_id: selectedJob.id,
          status: 'applied',
        });

      if (applicationError) throw applicationError;

      return { success: true };
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Application submitted successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit application");
    },
  });

  const openApply = (job: Job) => {
    setSelectedJob(job);
    setSubmitted(false);
    setFormData({ name: '', email: '', phone: '', resume: null });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.resume || !selectedJob) return;
    submitApplication.mutate();
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <nav className="border-b border-border/50 backdrop-blur-xl sticky top-0 z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </Link>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-tr from-primary to-accent rounded-md flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">
              Cortex<span className="text-primary">Careers</span>
            </span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl sm:text-5xl font-display font-bold mb-6 text-gradient">
            Join the Revolution
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Help us build the autonomous future of work. We are looking for visionaries, not just employees.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No open positions at the moment. Check back later!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job, index) => (
              <motion.div 
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all group hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-xl font-display font-semibold mb-2 group-hover:text-primary transition-colors">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <Briefcase className="w-4 h-4 mr-1.5 text-muted-foreground/50" /> {job.department}
                      </span>
                      <span className="flex items-center">
                        <MapPin className="w-4 h-4 mr-1.5 text-muted-foreground/50" /> {job.location}
                      </span>
                      <span className="flex items-center">
                        <Clock className="w-4 h-4 mr-1.5 text-muted-foreground/50" /> {job.job_type}
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => openApply(job)}
                    variant="outline"
                    className="w-full sm:w-auto hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  >
                    Apply Now
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Apply Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden relative"
            >
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {submitted ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-display font-bold mb-2">Application Sent!</h3>
                  <p className="text-muted-foreground mb-6">
                    Thanks for applying, {formData.name}. Our AI agent is reviewing your resume now.
                  </p>
                  <div className="bg-secondary p-4 rounded-lg mb-6 border border-border">
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Status</p>
                    <p className="text-primary text-sm font-medium">
                      AI Screening in Progress
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowModal(false)}
                    variant="secondary"
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <div className="p-8">
                  <div className="mb-6">
                    <h3 className="text-xl font-display font-bold">Apply for {selectedJob?.title}</h3>
                    <p className="text-muted-foreground text-sm">Upload your details below.</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder-muted-foreground"
                        placeholder="Jane Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder-muted-foreground"
                        placeholder="jane@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Phone (Optional)</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder-muted-foreground"
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Resume (PDF/Doc)</label>
                      <div className="relative">
                        <input
                          type="file"
                          required
                          accept=".pdf,.doc,.docx"
                          onChange={e => setFormData({ ...formData, resume: e.target.files?.[0] || null })}
                          className="w-full file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-primary hover:file:bg-secondary/80 text-muted-foreground bg-secondary border border-border rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={submitApplication.isPending}
                      className="w-full mt-2"
                      size="lg"
                    >
                      {submitApplication.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Submit Application
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Careers;