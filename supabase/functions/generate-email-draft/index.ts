import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  applicationId: string;
  emailType: 'interview_invite' | 'rejection' | 'offer' | 'follow_up' | 'custom';
  customPrompt?: string;
  additionalContext?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, emailType, customPrompt, additionalContext }: RequestBody = await req.json();

    if (!applicationId || !emailType) {
      return new Response(
        JSON.stringify({ error: 'applicationId and emailType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch application details
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        status,
        ai_summary,
        candidates!inner(full_name, email),
        jobs!inner(title, department, location)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidate = (application as any).candidates;
    const job = (application as any).jobs;

    // Fetch any scheduled interviews
    const { data: interviews } = await supabase
      .from('interviews')
      .select('scheduled_at, interview_type, meeting_url')
      .eq('application_id', applicationId)
      .order('scheduled_at', { ascending: false })
      .limit(1);

    const upcomingInterview = interviews?.[0];

    const aiapiApiKey = Deno.env.get('AIAPI_API_KEY');
    if (!aiapiApiKey) {
      throw new Error('AIAPI_API_KEY not configured');
    }

    const emailTypePrompts: Record<string, string> = {
      interview_invite: `Generate a professional interview invitation email. Include:
- Warm greeting
- Confirmation of their application for the specific role
- Interview details (mention they will receive calendar invite separately)
- What to prepare
- Expression of enthusiasm about meeting them`,

      rejection: `Generate a professional and empathetic rejection email. Include:
- Sincere appreciation for their application and time
- Brief positive note about their qualifications
- Clear but kind rejection
- Encouragement to apply for future positions
- Wish them well in their job search`,

      offer: `Generate an enthusiastic offer email (not the formal offer letter). Include:
- Congratulations
- Expression of excitement about them joining
- Mention that formal offer letter is attached/forthcoming
- Next steps for acceptance
- Openness to discuss any questions`,

      follow_up: `Generate a professional follow-up email to check on their status. Include:
- Reference to their application/interview
- Genuine interest in their thoughts
- Invitation to ask questions
- Clear next steps or timeline`,

      custom: customPrompt || 'Generate a professional email based on the context provided.'
    };

    const systemPrompt = `You are an expert HR communications specialist at CortexHR. Write professional, warm, and clear emails that reflect a modern, employee-first company culture.

Guidelines:
- Be professional but personable
- Use the candidate's first name
- Be concise but thorough
- Avoid corporate jargon
- Show genuine care for the candidate
- Sign off from "The CortexHR Team"`;

    const userPrompt = `${emailTypePrompts[emailType]}

CANDIDATE: ${candidate.full_name}
EMAIL: ${candidate.email}
POSITION: ${job.title}
DEPARTMENT: ${job.department}
LOCATION: ${job.location}
APPLICATION STATUS: ${application.status}

${upcomingInterview ? `UPCOMING INTERVIEW: ${new Date(upcomingInterview.scheduled_at).toLocaleString()} - ${upcomingInterview.interview_type}` : ''}

${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ''}

Generate the email subject and body.`;

    const aiResponse = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiapiApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "email_draft",
              description: "Return the email draft with subject and body",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Email subject line" },
                  body: { type: "string", description: "Email body in plain text" },
                  htmlBody: { type: "string", description: "Email body in HTML format" }
                },
                required: ["subject", "body", "htmlBody"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "email_draft" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error('No email generated');
    }

    const result = JSON.parse(toolCall.function.arguments);

    console.log(`Generated ${emailType} email draft for ${candidate.full_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        candidateName: candidate.full_name,
        candidateEmail: candidate.email,
        emailType,
        subject: result.subject,
        body: result.body,
        htmlBody: result.htmlBody
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating email draft:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
