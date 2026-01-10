import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh token:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

async function getValidAccessToken(
  tokenData: TokenData,
  supabase: any,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const now = new Date();
  const expiry = new Date(tokenData.token_expiry);

  if (expiry > now) {
    return tokenData.access_token;
  }

  console.log(`Refreshing token for user ${tokenData.user_id}`);
  const newTokens = await refreshAccessToken(tokenData.refresh_token, clientId, clientSecret);

  if (!newTokens) {
    return null;
  }

  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + newTokens.expires_in);

  await supabase
    .from('hr_google_tokens')
    .update({
      access_token: newTokens.access_token,
      token_expiry: newExpiry.toISOString(),
    })
    .eq('user_id', tokenData.user_id);

  return newTokens.access_token;
}

async function searchResumeEmails(accessToken: string): Promise<any[]> {
  // Enhanced query to find resumes and job applications from various sources
  // Widened window to 3d to ensure we don't miss anything from weekends/timezones
  const queries = [
    'has:attachment (resume OR cv OR application) newer_than:3d',
    'subject:(resume OR cv OR application) newer_than:3d', // Added catch-all for inline text resumes
    'from:linkedin newer_than:3d subject:(applied OR application OR candidate)',
    'from:indeed newer_than:3d',
    'from:glassdoor newer_than:3d',
    'from:noreply subject:(job OR application OR candidate) newer_than:3d',
  ];

  const allMessages: any[] = [];
  const seenIds = new Set<string>();

  console.log('Searching Gmail for recent applications...');

  for (const queryStr of queries) {
    try {
      const query = encodeURIComponent(queryStr);
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=30`, // Increased limit slightly
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const messages = data.messages || [];
        console.log(`Query "${queryStr}" found ${messages.length} messages`);

        for (const msg of messages) {
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            allMessages.push(msg);
          }
        }
      } else {
        console.error(`Query "${queryStr}" failed: ${response.status} ${await response.text()}`);
      }
    } catch (error) {
      console.error(`Error searching Gmail with query "${queryStr}":`, error);
    }
  }

  console.log(`Found ${allMessages.length} unique potential application emails`);
  return allMessages;
}

async function getEmailDetails(accessToken: string, messageId: string): Promise<any> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting email details:', error);
    return null;
  }
}

async function getAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error getting attachment:', error);
    return null;
  }
}

function parseEmailHeaders(headers: any[]): { from: string; subject: string; date: string } {
  let from = '';
  let subject = '';
  let date = '';

  for (const header of headers) {
    const name = header.name.toLowerCase();
    if (name === 'from') from = header.value;
    else if (name === 'subject') subject = header.value;
    else if (name === 'date') date = header.value;
  }

  return { from, subject, date };
}

function extractNameAndEmail(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim(), email: match[2].trim().toLowerCase() };
  }
  return { name: from.split('@')[0], email: from.toLowerCase() };
}

function findResumeAttachment(parts: any[]): { filename: string; attachmentId: string; mimeType: string } | null {
  const resumeExtensions = ['.pdf', '.doc', '.docx'];

  for (const part of parts) {
    if (part.filename) {
      const lowerFilename = part.filename.toLowerCase();
      const isResume = resumeExtensions.some((ext: string) => lowerFilename.endsWith(ext));

      if (isResume && part.body?.attachmentId) {
        return {
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          mimeType: part.mimeType,
        };
      }
    }

    if (part.parts) {
      const result = findResumeAttachment(part.parts);
      if (result) return result;
    }
  }

  return null;
}

function extractEmailBody(payload: any): string {
  let body = '';

  function extractFromParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        const decoded = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        body += decoded + '\n';
      } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
        const decoded = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        // Strip HTML tags for basic text extraction
        body += decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() + '\n';
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }

  if (payload.body?.data) {
    body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  } else if (payload.parts) {
    extractFromParts(payload.parts);
  }

  return body.substring(0, 5000); // Limit body length
}

function detectSource(from: string, subject: string): { source: string; sourceDetails: string } {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  if (fromLower.includes('linkedin')) {
    return { source: 'linkedin', sourceDetails: 'LinkedIn application notification' };
  }
  if (fromLower.includes('indeed') || fromLower.includes('indeedapply')) {
    return { source: 'indeed', sourceDetails: 'Indeed application' };
  }
  if (fromLower.includes('glassdoor')) {
    return { source: 'glassdoor', sourceDetails: 'Glassdoor application' };
  }
  if (fromLower.includes('ziprecruiter')) {
    return { source: 'other', sourceDetails: 'ZipRecruiter application' };
  }
  if (fromLower.includes('monster')) {
    return { source: 'other', sourceDetails: 'Monster application' };
  }
  if (subjectLower.includes('application') || subjectLower.includes('resume') || subjectLower.includes('cv')) {
    return { source: 'email', sourceDetails: 'Direct email application' };
  }

  return { source: 'email', sourceDetails: 'Email with resume attachment' };
}

function extractLinkedInDetails(body: string): { name?: string; linkedinUrl?: string; jobTitle?: string } {
  const result: { name?: string; linkedinUrl?: string; jobTitle?: string } = {};

  // Extract LinkedIn profile URL
  const linkedinMatch = body.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
  if (linkedinMatch) {
    result.linkedinUrl = `https://www.linkedin.com/in/${linkedinMatch[1]}`;
  }

  // Try to extract name from LinkedIn notification patterns
  const namePatterns = [
    /([A-Z][a-z]+ [A-Z][a-z]+) has applied/i,
    /([A-Z][a-z]+ [A-Z][a-z]+) applied for/i,
    /New applicant: ([A-Z][a-z]+ [A-Z][a-z]+)/i,
    /Candidate: ([A-Z][a-z]+ [A-Z][a-z]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = body.match(pattern);
    if (match) {
      result.name = match[1];
      break;
    }
  }

  // Try to extract job title
  const jobPatterns = [
    /applied for (?:the )?(.+?) (?:position|role|job)/i,
    /application for (?:the )?(.+?) (?:position|role|job)/i,
    /Position: (.+?)(?:\n|$)/i,
    /Role: (.+?)(?:\n|$)/i,
  ];

  for (const pattern of jobPatterns) {
    const match = body.match(pattern);
    if (match) {
      result.jobTitle = match[1].trim();
      break;
    }
  }

  return result;
}

async function processEmail(
  accessToken: string,
  messageId: string,
  hrUserId: string,
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ processed: boolean; candidateEmail?: string; jobTitle?: string; source?: string }> {
  const email = await getEmailDetails(accessToken, messageId);
  if (!email) {
    return { processed: false };
  }

  const { from, subject } = parseEmailHeaders(email.payload.headers);
  const { name: senderName, email: senderEmail } = extractNameAndEmail(from);
  const { source, sourceDetails } = detectSource(from, subject);
  const emailBody = extractEmailBody(email.payload);

  console.log(`Processing [${source}] email from: ${senderEmail}, subject: ${subject}`);

  // For job platform notifications, extract actual candidate info
  let candidateEmail = senderEmail;
  let candidateName = senderName;
  let linkedinUrl: string | undefined;
  let jobTitle: string | undefined;

  if (source === 'linkedin' || source === 'indeed' || source === 'glassdoor') {
    // These are notification emails, extract candidate details from body
    const details = extractLinkedInDetails(emailBody);
    if (details.name) candidateName = details.name;
    if (details.linkedinUrl) linkedinUrl = details.linkedinUrl;
    if (details.jobTitle) jobTitle = details.jobTitle;

    // Try to find candidate email in body
    const emailMatch = emailBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && !emailMatch[1].includes('linkedin') && !emailMatch[1].includes('indeed')) {
      candidateEmail = emailMatch[1].toLowerCase();
    }
  }

  // Check if this candidate was already processed
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('email', candidateEmail)
    .maybeSingle();

  // Find resume attachment
  const parts = email.payload.parts || [email.payload];
  const attachment = findResumeAttachment(parts);
  let resumeBase64: string | undefined;
  let resumeFilename: string | undefined;

  if (attachment) {
    console.log(`Found attachment: ${attachment.filename}`);
    const attachmentData = await getAttachment(accessToken, messageId, attachment.attachmentId);
    if (attachmentData) {
      resumeBase64 = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
      resumeFilename = attachment.filename;
    }
  }

  // For LinkedIn/Indeed, we might not have an attachment but still have a valid application
  if (!attachment && source !== 'linkedin' && source !== 'indeed' && source !== 'glassdoor') {
    console.log('No resume attachment found and not a job platform notification');
    return { processed: false };
  }

  // If candidate exists and has already applied, skip
  if (existingCandidate) {
    // Check if they've applied to any job recently (within last 24 hours)
    const { data: recentApp } = await supabase
      .from('applications')
      .select('id, created_at')
      .eq('candidate_id', existingCandidate.id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (recentApp) {
      console.log(`Candidate ${candidateEmail} already applied recently, skipping`);
      return { processed: false, candidateEmail };
    }
  }

  // Call the unified ingest-application function
  try {
    const ingestResponse = await fetch(`${supabaseUrl}/functions/v1/ingest-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-source': source,
      },
      body: JSON.stringify({
        candidateEmail,
        candidateName,
        linkedinUrl,
        resumeBase64,
        resumeFilename,
        subject,
        message: emailBody.substring(0, 2000),
        source,
        sourceDetails,
        jobTitle, // From extracted info
      }),
    });

    if (ingestResponse.ok) {
      const result = await ingestResponse.json();
      console.log(`Application ingested: ${result.applicationId} for job: ${result.jobTitle}`);
      return {
        processed: result.isNew,
        candidateEmail,
        jobTitle: result.jobTitle,
        source
      };
    } else {
      const errorText = await ingestResponse.text();
      console.error('Ingest failed:', errorText);
      return { processed: false };
    }
  } catch (error) {
    console.error('Error calling ingest-application:', error);
    return { processed: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: 'Google OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const specificUserId = body.userId;

    let query = supabase.from('hr_google_tokens').select('*');
    if (specificUserId) {
      query = query.eq('user_id', specificUserId);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError || !tokens?.length) {
      return new Response(
        JSON.stringify({ message: 'No connected Gmail accounts found', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${tokens.length} connected Gmail accounts`);

    const results: {
      userId: string;
      processed: number;
      candidates: { email: string; job?: string; source?: string }[]
    }[] = [];

    for (const tokenData of tokens) {
      const accessToken = await getValidAccessToken(tokenData, supabase, clientId, clientSecret);

      if (!accessToken) {
        console.error(`Failed to get valid token for user ${tokenData.user_id}`);
        continue;
      }

      const messages = await searchResumeEmails(accessToken);
      console.log(`Found ${messages.length} potential application emails for user ${tokenData.user_id}`);

      const userResult = {
        userId: tokenData.user_id,
        processed: 0,
        candidates: [] as { email: string; job?: string; source?: string }[]
      };

      for (const message of messages) {
        const result = await processEmail(
          accessToken,
          message.id,
          tokenData.user_id,
          supabase,
          supabaseUrl,
          supabaseServiceKey
        );
        if (result.processed) {
          userResult.processed++;
          if (result.candidateEmail) {
            userResult.candidates.push({
              email: result.candidateEmail,
              job: result.jobTitle,
              source: result.source,
            });
          }
        }
      }

      results.push(userResult);
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    console.log(`Total applications processed: ${totalProcessed}`);

    return new Response(
      JSON.stringify({
        message: `Processed ${totalProcessed} applications from ${tokens.length} accounts`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in poll-gmail-resumes:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
