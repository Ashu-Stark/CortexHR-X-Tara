import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Briefcase, MapPin, Clock, Upload, FileText, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
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

const CandidatePortal = () => {
  const [searchParams] = useSearchParams();
  const candidateToken = searchParams.get("token");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      setJobs(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) {
      toast({ variant: "destructive", title: "Please select a job position" });
      return;
    }
    if (!resumeFile) {
      toast({ variant: "destructive", title: "Please upload your resume" });
      return;
    }

    setLoading(true);

    try {
      // Create or get candidate
      let candidateId: string;
      const { data: existingCandidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", formData.email)
        .single();

      if (existingCandidate) {
        candidateId = existingCandidate.id;
      } else {
        const { data: newCandidate, error: candidateError } = await supabase
          .from("candidates")
          .insert({
            full_name: formData.fullName,
            email: formData.email,
            phone: formData.phone,
          })
          .select()
          .single();

        if (candidateError) throw candidateError;
        candidateId = newCandidate.id;
      }

      // Upload resume
      const fileExt = resumeFile.name.split(".").pop();
      const fileName = `${candidateId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, resumeFile);

      if (uploadError) {
        console.error("Upload error:", uploadError);
      }

      // Store the file path (not URL) so backend can download from storage
      await supabase
        .from("candidates")
        .update({ resume_url: fileName }) // Store path, not public URL
        .eq("id", candidateId);

      // Create application
      const { data: application, error: appError } = await supabase
        .from("applications")
        .insert({
          candidate_id: candidateId,
          job_id: selectedJob.id,
          status: "applied",
        })
        .select()
        .single();

      if (appError) throw appError;

      // Read resume file as text for AI parsing (for PDFs, we'd need a different approach)
      const resumeText = await resumeFile.text();

      // Trigger AI parsing
      await supabase.functions.invoke("parse-resume", {
        body: {
          resumeText,
          applicationId: application.id,
          jobRequirements: selectedJob.requirements,
        },
      });

      // Send confirmation email
      await supabase.functions.invoke("send-email", {
        body: {
          to: formData.email,
          subject: `Application Received: ${selectedJob.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">Thank You for Applying!</h2>
              <p>Dear ${formData.fullName},</p>
              <p>We have received your application for the <strong>${selectedJob.title}</strong> position.</p>
              <p>Our team will review your resume and get back to you soon.</p>
              <p>Best regards,<br/>The CortexHR Team</p>
            </div>
          `,
          emailType: "application_received",
          candidateId,
        },
      });

      setSubmitted(true);
      toast({
        title: "Application submitted!",
        description: "We'll review your resume and get back to you soon.",
      });

    } catch (error: any) {
      console.error("Application error:", error);
      toast({
        variant: "destructive",
        title: "Application failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Application Submitted!
          </h1>
          <p className="text-muted-foreground max-w-md">
            Thank you for applying. We've received your application and will review it shortly.
            You'll receive an email confirmation soon.
          </p>
          <Button onClick={() => { setSubmitted(false); setSelectedJob(null); }}>
            Apply for Another Position
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-tr from-primary to-accent rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-foreground">
              Cortex<span className="text-primary">HR</span>
            </span>
            <span className="text-muted-foreground ml-2">| Careers</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-display font-bold text-foreground">
              Join Our Team
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Discover exciting opportunities and take the next step in your career.
              Our AI-powered system ensures a fast and fair application process.
            </p>
          </div>

          {!selectedJob ? (
            /* Job Listings */
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <motion.div
                  key={job.id}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card 
                    className="h-full cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSelectedJob(job)}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg">{job.title}</CardTitle>
                      <CardDescription>{job.department}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        {job.location}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Briefcase className="w-4 h-4" />
                        {job.job_type}
                      </div>
                      <Button className="w-full mt-4" size="sm">
                        View & Apply
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {jobs.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No open positions at the moment. Check back soon!</p>
                </div>
              )}
            </div>
          ) : (
            /* Application Form */
            <div className="max-w-2xl mx-auto">
              <Button
                variant="ghost"
                onClick={() => setSelectedJob(null)}
                className="mb-6"
              >
                ← Back to Jobs
              </Button>

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedJob.title}</CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {selectedJob.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-4 h-4" />
                          {selectedJob.job_type}
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {selectedJob.description && (
                    <div>
                      <h3 className="font-semibold mb-2">About the Role</h3>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                        {selectedJob.description}
                      </p>
                    </div>
                  )}

                  {selectedJob.requirements && (
                    <div>
                      <h3 className="font-semibold mb-2">Requirements</h3>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                        {selectedJob.requirements}
                      </p>
                    </div>
                  )}

                  <hr className="border-border" />

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <h3 className="font-semibold">Apply Now</h3>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="john@example.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone (Optional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Resume</Label>
                      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <input
                          type="file"
                          id="resume"
                          accept=".pdf,.doc,.docx,.txt"
                          onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                        <label htmlFor="resume" className="cursor-pointer">
                          {resumeFile ? (
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <FileText className="w-5 h-5" />
                              {resumeFile.name}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                              <p className="text-muted-foreground text-sm">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-muted-foreground">
                                PDF, DOC, DOCX or TXT (max 10MB)
                              </p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" size="lg" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Submit Application"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default CandidatePortal;
