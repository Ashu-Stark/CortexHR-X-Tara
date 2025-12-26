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

  // If token is still valid, return it
  if (expiry > now) {
    return tokenData.access_token;
  }

  // Token expired, refresh it
  console.log(`Refreshing token for user ${tokenData.user_id}`);
  const newTokens = await refreshAccessToken(tokenData.refresh_token, clientId, clientSecret);
  
  if (!newTokens) {
    return null;
  }

  // Update token in database
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
  // Search for emails with resume-related subjects or attachments in the last 24 hours
  const query = encodeURIComponent('has:attachment (resume OR cv OR application OR job) newer_than:1d');
  
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.error('Gmail search failed:', await response.text());
      return [];
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error searching Gmail:', error);
    return [];
  }
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
    return data.data; // Base64 encoded content
  } catch (error) {
    console.error('Error getting attachment:', error);
    return null;
  }
}

function parseEmailHeaders(headers: any[]): { from: string; subject: string } {
  let from = '';
  let subject = '';
  
  for (const header of headers) {
    if (header.name.toLowerCase() === 'from') {
      from = header.value;
    } else if (header.name.toLowerCase() === 'subject') {
      subject = header.value;
    }
  }
  
  return { from, subject };
}

function extractNameAndEmail(from: string): { name: string; email: string } {
  // Parse "Name <email@example.com>" format
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim(), email: match[2].trim() };
  }
  // Just email
  return { name: from.split('@')[0], email: from };
}

function findResumeAttachment(parts: any[]): { filename: string; attachmentId: string; mimeType: string } | null {
  const resumeExtensions = ['.pdf', '.doc', '.docx'];
  
  for (const part of parts) {
    if (part.filename) {
      const lowerFilename = part.filename.toLowerCase();
      const isResume = resumeExtensions.some(ext => lowerFilename.endsWith(ext)) &&
        (lowerFilename.includes('resume') || lowerFilename.includes('cv') || true); // Accept any document
      
      if (isResume && part.body?.attachmentId) {
        return {
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          mimeType: part.mimeType,
        };
      }
    }
    
    // Check nested parts
    if (part.parts) {
      const result = findResumeAttachment(part.parts);
      if (result) return result;
    }
  }
  
  return null;
}

async function processEmail(
  accessToken: string,
  messageId: string,
  hrUserId: string,
  supabase: any
): Promise<{ processed: boolean; candidateEmail?: string }> {
  const email = await getEmailDetails(accessToken, messageId);
  if (!email) {
    return { processed: false };
  }

  const { from, subject } = parseEmailHeaders(email.payload.headers);
  const { name, email: candidateEmail } = extractNameAndEmail(from);

  console.log(`Processing email from: ${candidateEmail}, subject: ${subject}`);

  // Check if this email was already processed
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('email', candidateEmail)
    .maybeSingle();

  if (existingCandidate) {
    console.log(`Candidate ${candidateEmail} already exists, skipping`);
    return { processed: false, candidateEmail };
  }

  // Find resume attachment
  const parts = email.payload.parts || [email.payload];
  const attachment = findResumeAttachment(parts);

  if (!attachment) {
    console.log('No resume attachment found in email');
    return { processed: false };
  }

  console.log(`Found attachment: ${attachment.filename}`);

  // Download attachment
  const attachmentData = await getAttachment(accessToken, messageId, attachment.attachmentId);
  if (!attachmentData) {
    return { processed: false };
  }

  // Convert from URL-safe base64 to standard base64
  const base64 = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
  const binaryData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  // Upload to storage
  const fileName = `${Date.now()}_${attachment.filename}`;
  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(fileName, binaryData, {
      contentType: attachment.mimeType,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return { processed: false };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('resumes')
    .getPublicUrl(fileName);

  // Create candidate record
  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .insert({
      full_name: name,
      email: candidateEmail,
      resume_url: urlData.publicUrl,
    })
    .select()
    .single();

  if (candidateError) {
    console.error('Candidate creation error:', candidateError);
    return { processed: false };
  }

  console.log(`Created candidate: ${candidate.id} for ${candidateEmail}`);

  // Try to find a matching job from the email subject
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title')
    .eq('is_active', true)
    .limit(1);

  if (jobs && jobs.length > 0) {
    // Create application
    const { error: appError } = await supabase
      .from('applications')
      .insert({
        candidate_id: candidate.id,
        job_id: jobs[0].id,
        status: 'applied',
        notes: `Auto-imported from email: ${subject}`,
      });

    if (!appError) {
      console.log(`Created application for candidate ${candidate.id}`);
    }
  }

  return { processed: true, candidateEmail };
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

    // Check if specific user ID was provided
    const body = await req.json().catch(() => ({}));
    const specificUserId = body.userId;

    // Get all HR users with connected Gmail (or specific user)
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

    const results: { userId: string; processed: number; candidates: string[] }[] = [];

    for (const tokenData of tokens) {
      const accessToken = await getValidAccessToken(tokenData, supabase, clientId, clientSecret);
      
      if (!accessToken) {
        console.error(`Failed to get valid token for user ${tokenData.user_id}`);
        continue;
      }

      // Search for resume emails
      const messages = await searchResumeEmails(accessToken);
      console.log(`Found ${messages.length} potential resume emails for user ${tokenData.user_id}`);

      const userResult = { userId: tokenData.user_id, processed: 0, candidates: [] as string[] };

      for (const message of messages) {
        const result = await processEmail(accessToken, message.id, tokenData.user_id, supabase);
        if (result.processed) {
          userResult.processed++;
          if (result.candidateEmail) {
            userResult.candidates.push(result.candidateEmail);
          }
        }
      }

      results.push(userResult);
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    console.log(`Total resumes processed: ${totalProcessed}`);

    return new Response(
      JSON.stringify({ 
        message: `Processed ${totalProcessed} resumes from ${tokens.length} accounts`,
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
