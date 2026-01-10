import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface EmailPayload {
  from: string;
  fromName?: string;
  subject: string;
  body?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    content: string; // base64 encoded
  }>;
  jobId?: string; // Optional: extracted from subject or email address
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret for security
    const webhookSecret = Deno.env.get('EMAIL_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');
    
    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: EmailPayload = await req.json();
    console.log('Received email from:', payload.from, 'Subject:', payload.subject);

    // Validate required fields
    if (!payload.from || !payload.attachments || payload.attachments.length === 0) {
      console.log('No attachments found in email');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No resume attachments found',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter for resume file types
    const resumeAttachments = payload.attachments.filter(att => {
      const ext = att.filename.toLowerCase();
      return ext.endsWith('.pdf') || ext.endsWith('.doc') || ext.endsWith('.docx');
    });

    if (resumeAttachments.length === 0) {
      console.log('No valid resume files (PDF, DOC, DOCX) found');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No valid resume files (PDF, DOC, DOCX) found',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to extract job ID from subject line (e.g., "Application for [JOB-123]" or "RE: Software Engineer Position")
    let jobId = payload.jobId;
    if (!jobId) {
      // Try to find job by matching subject to job title
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('is_active', true);

      if (jobs && jobs.length > 0) {
        const subjectLower = payload.subject.toLowerCase();
        const matchedJob = jobs.find(job => 
          subjectLower.includes(job.title.toLowerCase())
        );
        if (matchedJob) {
          jobId = matchedJob.id;
          console.log('Matched job from subject:', matchedJob.title);
        } else {
          // Default to first active job if no match
          jobId = jobs[0].id;
          console.log('No job match in subject, using first active job:', jobs[0].title);
        }
      }
    }

    if (!jobId) {
      console.error('No active jobs found to apply to');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No active jobs found',
          processed: 0 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract candidate name from email or sender name
    const candidateName = payload.fromName || payload.from.split('@')[0].replace(/[._-]/g, ' ');
    const candidateEmail = payload.from.toLowerCase().trim();

    // Check if candidate already exists
    let candidateId: string;
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', candidateEmail)
      .single();

    if (existingCandidate) {
      candidateId = existingCandidate.id;
      console.log('Found existing candidate:', candidateId);
    } else {
      // Create new candidate
      const { data: newCandidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          email: candidateEmail,
          full_name: candidateName,
        })
        .select('id')
        .single();

      if (candidateError) {
        console.error('Error creating candidate:', candidateError);
        throw candidateError;
      }
      candidateId = newCandidate.id;
      console.log('Created new candidate:', candidateId);
    }

    // Process first resume attachment
    const resume = resumeAttachments[0];
    console.log('Processing resume:', resume.filename);

    // Decode base64 content
    const binaryContent = Uint8Array.from(atob(resume.content), c => c.charCodeAt(0));
    
    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFilename = resume.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${candidateId}/${timestamp}_${sanitizedFilename}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, binaryContent, {
        contentType: resume.contentType || 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading resume:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('resumes')
      .getPublicUrl(storagePath);

    const resumeUrl = urlData.publicUrl;
    console.log('Resume uploaded to:', resumeUrl);

    // Update candidate with resume URL
    await supabase
      .from('candidates')
      .update({ resume_url: resumeUrl })
      .eq('id', candidateId);

    // Check if application already exists for this job
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .single();

    if (existingApp) {
      console.log('Application already exists for this candidate and job');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Candidate already applied for this job',
          candidateId,
          applicationId: existingApp.id,
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create application (this will trigger auto-process via database trigger)
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        candidate_id: candidateId,
        job_id: jobId,
        status: 'applied',
        notes: `Auto-ingested from email: ${payload.subject}`,
      })
      .select('id')
      .single();

    if (appError) {
      console.error('Error creating application:', appError);
      throw appError;
    }

    console.log('Application created:', application.id, '- Auto-processing will be triggered');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Resume ingested and application created successfully',
        candidateId,
        applicationId: application.id,
        processed: 1 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in ingest-email-resume:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
