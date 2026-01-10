import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-source',
};

// Unified application payload - works with LinkedIn, Indeed, email forwarding, etc.
interface ApplicationPayload {
  // Required
  candidateEmail: string;
  
  // Optional - we'll extract what we can
  candidateName?: string;
  phone?: string;
  resumeUrl?: string; // Direct URL to resume
  resumeBase64?: string; // Base64 encoded resume
  resumeFilename?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  
  // Job matching
  jobId?: string; // Explicit job ID if known
  jobTitle?: string; // Job title for matching
  
  // Context for AI matching
  subject?: string;
  message?: string; // Cover letter or application message
  
  // Source tracking
  source: 'linkedin' | 'indeed' | 'glassdoor' | 'email' | 'website' | 'referral' | 'other';
  sourceDetails?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional webhook secret verification
    const webhookSecret = Deno.env.get('APPLICATION_WEBHOOK_SECRET');
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

    const payload: ApplicationPayload = await req.json();
    const source = req.headers.get('x-source') || payload.source || 'other';
    
    console.log(`[${source.toUpperCase()}] Ingesting application from: ${payload.candidateEmail}`);

    // Validate required fields
    if (!payload.candidateEmail) {
      return new Response(
        JSON.stringify({ success: false, message: 'candidateEmail is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidateEmail = payload.candidateEmail.toLowerCase().trim();
    
    // Clean candidate name
    let candidateName = payload.candidateName || '';
    if (!candidateName) {
      // Try to extract from email
      candidateName = candidateEmail.split('@')[0].replace(/[._-]/g, ' ');
      // Capitalize first letters
      candidateName = candidateName.replace(/\b\w/g, l => l.toUpperCase());
    }

    // === Step 1: Match to a job ===
    let jobId = payload.jobId;
    let jobTitle = payload.jobTitle;
    let matchConfidence = 0;
    let matchReason = '';

    if (!jobId) {
      // Call job matching function
      try {
        const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-job-from-content`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            subject: payload.subject || payload.jobTitle || '',
            body: payload.message || '',
            source: source,
            candidateName: candidateName,
          }),
        });

        if (matchResponse.ok) {
          const matchData = await matchResponse.json();
          if (matchData.match) {
            jobId = matchData.match.jobId;
            jobTitle = matchData.match.jobTitle;
            matchConfidence = matchData.match.confidence;
            matchReason = matchData.match.matchReason;
            console.log(`Job matched: ${jobTitle} (${matchConfidence}% - ${matchReason})`);
          }
        }
      } catch (matchError) {
        console.error('Job matching failed:', matchError);
      }
    }

    // Fallback to first active job if no match
    if (!jobId) {
      const { data: defaultJob } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (defaultJob) {
        jobId = defaultJob.id;
        jobTitle = defaultJob.title;
        matchReason = 'Default fallback';
        console.log(`Using default job: ${jobTitle}`);
      } else {
        return new Response(
          JSON.stringify({ success: false, message: 'No active jobs available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === Step 2: Create or update candidate ===
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id, resume_url')
      .eq('email', candidateEmail)
      .maybeSingle();

    let candidateId: string;
    let resumeUrl = payload.resumeUrl;

    // Handle resume upload if base64 provided
    if (payload.resumeBase64 && payload.resumeFilename) {
      try {
        const binaryContent = Uint8Array.from(atob(payload.resumeBase64), c => c.charCodeAt(0));
        const timestamp = Date.now();
        const sanitizedFilename = payload.resumeFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const tempCandidateId = existingCandidate?.id || 'temp_' + timestamp;
        const storagePath = `${tempCandidateId}/${timestamp}_${sanitizedFilename}`;

        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(storagePath, binaryContent, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(storagePath);
          resumeUrl = urlData.publicUrl;
          console.log(`Resume uploaded: ${resumeUrl}`);
        } else {
          console.error('Resume upload failed:', uploadError);
        }
      } catch (uploadErr) {
        console.error('Resume upload error:', uploadErr);
      }
    }

    if (existingCandidate) {
      candidateId = existingCandidate.id;
      // Update candidate info if we have new data
      const updateData: any = {};
      if (payload.phone) updateData.phone = payload.phone;
      if (payload.linkedinUrl) updateData.linkedin_url = payload.linkedinUrl;
      if (payload.portfolioUrl) updateData.portfolio_url = payload.portfolioUrl;
      if (payload.githubUrl) updateData.github_url = payload.githubUrl;
      if (resumeUrl && !existingCandidate.resume_url) updateData.resume_url = resumeUrl;

      if (Object.keys(updateData).length > 0) {
        await supabase.from('candidates').update(updateData).eq('id', candidateId);
        console.log(`Updated existing candidate: ${candidateId}`);
      }
    } else {
      // Create new candidate
      const { data: newCandidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          email: candidateEmail,
          full_name: candidateName,
          phone: payload.phone || null,
          linkedin_url: payload.linkedinUrl || null,
          portfolio_url: payload.portfolioUrl || null,
          github_url: payload.githubUrl || null,
          resume_url: resumeUrl || null,
        })
        .select('id')
        .single();

      if (candidateError) {
        console.error('Error creating candidate:', candidateError);
        throw candidateError;
      }
      candidateId = newCandidate.id;
      console.log(`Created new candidate: ${candidateId}`);
    }

    // === Step 3: Check for existing application ===
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id, status')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .maybeSingle();

    if (existingApp) {
      console.log(`Application already exists: ${existingApp.id} (status: ${existingApp.status})`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Application already exists for this candidate and job',
          candidateId,
          applicationId: existingApp.id,
          jobId,
          jobTitle,
          isNew: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Step 4: Create application (triggers auto-processing) ===
    const notes = [
      `Source: ${source}`,
      payload.sourceDetails ? `Details: ${payload.sourceDetails}` : '',
      matchReason ? `Job Match: ${matchReason} (${matchConfidence}%)` : '',
      payload.message ? `Cover Letter: ${payload.message.substring(0, 500)}` : '',
    ].filter(Boolean).join('\n');

    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        candidate_id: candidateId,
        job_id: jobId,
        status: 'applied',
        notes: notes,
      })
      .select('id')
      .single();

    if (appError) {
      console.error('Error creating application:', appError);
      throw appError;
    }

    console.log(`Application created: ${application.id} - Auto-processing triggered`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Application ingested successfully',
        candidateId,
        applicationId: application.id,
        jobId,
        jobTitle,
        matchConfidence,
        matchReason,
        isNew: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in ingest-application:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
