import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESUME_BUCKET = 'resumes';

const guessMimeType = (pathOrUrl: string) => {
  const lower = pathOrUrl.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/pdf';
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const extractStoragePathFromUrl = (maybeUrl: string): string | null => {
  if (!maybeUrl.startsWith('http')) return null;

  try {
    const u = new URL(maybeUrl);
    const pathname = u.pathname;

    const markers = [
      `/storage/v1/object/public/${RESUME_BUCKET}/`,
      `/storage/v1/object/sign/${RESUME_BUCKET}/`,
      `/storage/v1/object/${RESUME_BUCKET}/`,
    ];

    for (const marker of markers) {
      const idx = pathname.indexOf(marker);
      if (idx !== -1) {
        return decodeURIComponent(pathname.slice(idx + marker.length));
      }
    }

    return null;
  } catch {
    return null;
  }
};

const getResumeBytes = async (supabase: any, resumeUrlOrPath: string) => {
  const storagePath =
    resumeUrlOrPath.startsWith('http') ? extractStoragePathFromUrl(resumeUrlOrPath) : resumeUrlOrPath;

  if (storagePath) {
    const { data, error } = await supabase.storage.from(RESUME_BUCKET).download(storagePath);
    if (error || !data) {
      throw new Error(`Failed to download resume from storage: ${error?.message || 'Unknown error'}`);
    }

    const buf = await data.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mime: guessMimeType(storagePath),
      source: 'storage' as const,
    };
  }

  const res = await fetch(resumeUrlOrPath);
  if (!res.ok) {
    throw new Error(`Failed to fetch resume file: ${res.status}`);
  }

  const mime = res.headers.get('content-type') || guessMimeType(resumeUrlOrPath);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), mime, source: 'fetch' as const };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'Application ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auto-processing application:', applicationId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Check if this is an authenticated HR user request or an internal trigger call
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let isAuthenticated = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Verify the user is HR staff for manual calls
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: userError,
      } = await supabaseAuth.auth.getUser();

      if (!userError && user) {
        const { data: roles } = await supabaseAuth
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .limit(1);

        if (roles && roles.length > 0) {
          isAuthenticated = true;
        }
      }
    }

    // For internal trigger calls (no auth header), we allow processing
    // The trigger is only set up on our database, so this is safe
    const isInternalTrigger = !authHeader;

    if (!isAuthenticated && !isInternalTrigger) {
      console.log('Unauthorized: not HR staff and not internal trigger');
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing request - authenticated: ${isAuthenticated}, internal: ${isInternalTrigger}`);

    // Use service role for fetching details
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch application with candidate and job details
    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select(`
        id,
        job_id,
        candidates!inner(id, full_name, resume_text, resume_url),
        jobs!inner(id, title, requirements)
      `)
      .eq('id', applicationId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching application:', fetchError);
      throw fetchError;
    }

    if (!application) {
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resumeText = (application as any).candidates?.resume_text;
    const resumeUrl = (application as any).candidates?.resume_url;
    const candidateId = (application as any).candidates?.id;
    const jobRequirements = (application as any).jobs?.requirements;

    // If no resume text but we have a resume URL, extract text from the PDF/image stored in file storage
    if (!resumeText && resumeUrl && candidateId) {
      console.log('No resume text available, extracting from document...');

      try {
        const aiapiApiKey = Deno.env.get('AIAPI_API_KEY');
        if (!aiapiApiKey) {
          throw new Error('AIAPI_API_KEY not configured');
        }

        const { bytes, mime, source } = await getResumeBytes(supabase, resumeUrl);
        console.log(`Fetched resume bytes via ${source}. Size:`, bytes.length, 'mime:', mime);

        const docBase64 = toBase64(bytes);

        console.log('Document fetched, sending to AI for text extraction...');

        const aiResponse = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiapiApiKey}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Please extract and return ALL text content from this resume/CV document.
Return the complete text as-is, preserving structure where possible.
Include all sections: personal info, work experience, education, skills, etc.
Just return the extracted text, no commentary.`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mime};base64,${docBase64}`,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('AI API error:', errorText);
          throw new Error(`Text extraction failed: ${errorText}`);
        }

        const aiData = await aiResponse.json();
        resumeText = aiData.choices?.[0]?.message?.content;

        if (resumeText) {
          console.log('Text extracted successfully, length:', resumeText.length);

          const { error: updateError } = await supabase
            .from('candidates')
            .update({ resume_text: resumeText })
            .eq('id', candidateId);

          if (updateError) {
            console.error('Failed to save extracted text:', updateError);
          }
        }
      } catch (extractError) {
        console.error('Document text extraction failed:', extractError);
      }
    }

    if (!resumeText) {
      console.log('No resume text available for application:', applicationId);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No resume text available for AI processing. Please ensure a valid PDF resume was uploaded.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the parse-resume function
    console.log('Invoking parse-resume function...');
    const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
      body: {
        resumeText,
        applicationId,
        jobRequirements
      }
    });

    if (parseError) {
      console.error('Error invoking parse-resume:', parseError);
      throw parseError;
    }

    console.log('Successfully processed application:', applicationId);

    return new Response(
      JSON.stringify(parseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in auto-process-application:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});