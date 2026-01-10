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

// Fetch GitHub profile data
interface GitHubUser {
  login: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  description: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  topics: string[];
  updated_at: string;
}

async function fetchGitHubProfile(username: string): Promise<{ user: GitHubUser | null; repos: GitHubRepo[] }> {
  try {
    const userResponse = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!userResponse.ok) {
      console.error('GitHub user fetch failed:', userResponse.status);
      return { user: null, repos: [] };
    }

    const user = await userResponse.json();

    const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    const repos = reposResponse.ok ? await reposResponse.json() : [];

    return { user, repos };
  } catch (error) {
    console.error('Error fetching GitHub profile:', error);
    return { user: null, repos: [] };
  }
}

function extractGitHubUsername(url: string): string | null {
  const patterns = [
    /github\.com\/([^\/\?]+)/i,
    /^([a-zA-Z0-9-]+)$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

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

    // For internal trigger calls (no auth header or apikey only), we allow processing
    const isInternalTrigger = !authHeader || authHeader.includes('apikey');

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
        ai_score,
        candidates!inner(id, full_name, resume_text, resume_url, github_url, linkedin_url, portfolio_url),
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

    // Skip if already processed (has a score) - ensures consistent scoring
    if ((application as any).ai_score !== null) {
      console.log('Application already processed, skipping re-analysis for consistent scoring');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Application already processed - scores remain consistent',
          analysis: { score: (application as any).ai_score }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resumeText = (application as any).candidates?.resume_text;
    const resumeUrl = (application as any).candidates?.resume_url;
    const candidateId = (application as any).candidates?.id;
    const jobRequirements = (application as any).jobs?.requirements;
    let githubUrl = (application as any).candidates?.github_url;
    let linkedinUrl = (application as any).candidates?.linkedin_url;
    let portfolioUrl = (application as any).candidates?.portfolio_url;
    // Variable to hold debug info about extraction attempt
    let extractionDebug: any = null;

    // If no resume text but we have a resume URL, invoke the extraction function
    if (!resumeText && resumeUrl && candidateId) {
      console.log('No resume text available, invoking extract-pdf-text function...');

      try {
        const { data: extractResult, error: extractError } = await supabase.functions.invoke('extract-pdf-text', {
          body: { resumeUrl, candidateId }
        });

        extractionDebug = { result: extractResult, error: extractError };

        if (extractError) {
          console.error('Text extraction function failed:', extractError);
          // Don't throw immediately, we might can process GitHub data or retry?
          // But usually we want resume text.
        } else {
          console.log('Extraction function returned:', extractResult);
          // Re-fetch the candidate to get the text updated by the function
          const { data: candidateData } = await supabase
            .from('candidates')
            .select('resume_text')
            .eq('id', candidateId)
            .single();

          if (candidateData?.resume_text) {
            resumeText = candidateData.resume_text;
            console.log('Resume text updated from extraction, length:', resumeText.length);
          }
        }
      } catch (invokeError) {
        console.error('Error invoking extract-pdf-text:', invokeError);
        extractionDebug = { exception: invokeError };
      }
    }

    // Fetch GitHub data if URL is available
    let githubData = null;
    if (githubUrl) {
      const username = extractGitHubUsername(githubUrl);
      if (username) {
        console.log('Fetching GitHub profile for:', username);
        githubData = await fetchGitHubProfile(username);
        console.log('GitHub data fetched:', githubData.user ? 'success' : 'failed');
      }
    }

    if (!resumeText && !githubData?.user) {
      console.log('No resume text or GitHub data available for application:', applicationId);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No resume text or GitHub profile available for AI processing.',
          debug: {
            resumeUrl,
            resumeTextLength: resumeText ? resumeText.length : 0,
            hasGithub: !!githubData?.user,
            candidateId,
            extractionDebug
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the parse-resume function with GitHub data
    console.log('Invoking parse-resume function...');
    const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
      body: {
        resumeText: resumeText || '',
        applicationId,
        jobRequirements,
        githubData,
        candidateId
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
