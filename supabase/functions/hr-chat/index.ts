import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const tools = [
  {
    type: "function",
    function: {
      name: "schedule_interview",
      description: "Schedule an interview with a candidate. Use this when the user asks to schedule, book, or set up an interview.",
      parameters: {
        type: "object",
        properties: {
          candidateName: { type: "string", description: "Name of the candidate" },
          dateTime: { type: "string", description: "Date and time for the interview in ISO format" },
          duration: { type: "number", description: "Duration in minutes, default 60" },
          interviewType: { type: "string", enum: ["Technical", "Behavioral", "HR Screen", "Final"], description: "Type of interview" }
        },
        required: ["candidateName", "dateTime"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_candidates",
      description: "Get a list of candidates, optionally filtered by status or job",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["applied", "screening", "interview", "offer", "hired", "rejected"] },
          limit: { type: "number", description: "Max number of candidates to return" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_interviews",
      description: "Get scheduled interviews, optionally filtered by date",
      parameters: {
        type: "object",
        properties: {
          upcoming: { type: "boolean", description: "Only get upcoming interviews" },
          today: { type: "boolean", description: "Only get today's interviews" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a candidate",
      parameters: {
        type: "object",
        properties: {
          candidateEmail: { type: "string" },
          subject: { type: "string" },
          message: { type: "string" }
        },
        required: ["candidateEmail", "subject", "message"]
      }
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const aiapiApiKey = Deno.env.get('AIAPI_API_KEY');
    if (!aiapiApiKey) {
      throw new Error('AIAPI_API_KEY not configured');
    }

    const systemPrompt = `You are an AI HR assistant for CortexHR. You help HR staff with:
- Scheduling and managing interviews
- Reviewing candidate information
- Sending emails to candidates
- Providing insights on hiring pipeline

You have access to tools to perform these actions. When users ask to schedule interviews, get candidate info, or send emails, use the appropriate tools.

Be professional, helpful, and concise. When scheduling interviews, always confirm the details before proceeding.
If you don't have enough information to complete an action, ask for clarification.`;

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
          ...messages
        ],
        tools,
        tool_choice: 'auto',
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Usage limit reached. Please check your account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message;

    // Check if the AI wants to call tools
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let result;

        console.log(`Executing tool: ${functionName}`, args);

        switch (functionName) {
          case 'get_candidates': {
            let query = supabase
              .from('applications')
              .select(`
                id,
                status,
                ai_score,
                candidates!inner(full_name, email),
                jobs!inner(title)
              `)
              .order('created_at', { ascending: false })
              .limit(args.limit || 10);

            if (args.status) {
              query = query.eq('status', args.status);
            }

            const { data, error } = await query;
            if (error) throw error;

            result = data?.map((app: any) => ({
              name: app.candidates.full_name,
              email: app.candidates.email,
              job: app.jobs.title,
              status: app.status,
              aiScore: app.ai_score
            })) || [];
            break;
          }

          case 'get_interviews': {
            const now = new Date();
            let query = supabase
              .from('interviews')
              .select(`
                id,
                scheduled_at,
                duration_minutes,
                interview_type,
                status,
                meeting_url,
                applications!inner(
                  candidates!inner(full_name, email),
                  jobs!inner(title)
                )
              `)
              .order('scheduled_at', { ascending: true });

            if (args.upcoming) {
              query = query.gte('scheduled_at', now.toISOString());
            }

            if (args.today) {
              const startOfDay = new Date(now);
              startOfDay.setHours(0, 0, 0, 0);
              const endOfDay = new Date(now);
              endOfDay.setHours(23, 59, 59, 999);
              query = query
                .gte('scheduled_at', startOfDay.toISOString())
                .lte('scheduled_at', endOfDay.toISOString());
            }

            const { data, error } = await query.limit(10);
            if (error) throw error;

            result = data?.map((interview: any) => ({
              candidateName: interview.applications.candidates.full_name,
              jobTitle: interview.applications.jobs.title,
              scheduledAt: interview.scheduled_at,
              duration: interview.duration_minutes,
              type: interview.interview_type,
              status: interview.status,
              meetingUrl: interview.meeting_url
            })) || [];
            break;
          }

          case 'schedule_interview': {
            // Find the candidate and their application
            const { data: candidates, error: candError } = await supabase
              .from('candidates')
              .select('id, email, full_name')
              .ilike('full_name', `%${args.candidateName}%`)
              .limit(1);

            if (candError || !candidates?.length) {
              result = { error: `Could not find candidate: ${args.candidateName}` };
              break;
            }

            const candidate = candidates[0];

            // Get their latest application
            const { data: applications, error: appError } = await supabase
              .from('applications')
              .select('id, jobs!inner(title)')
              .eq('candidate_id', candidate.id)
              .order('created_at', { ascending: false })
              .limit(1);

            if (appError || !applications?.length) {
              result = { error: `No application found for ${args.candidateName}` };
              break;
            }

            const application = applications[0];

            // Create the interview
            const { data: interview, error: intError } = await supabase
              .from('interviews')
              .insert({
                application_id: application.id,
                scheduled_at: args.dateTime,
                duration_minutes: args.duration || 60,
                interview_type: args.interviewType || 'Technical',
                status: 'scheduled'
              })
              .select()
              .single();

            if (intError) {
              result = { error: `Failed to schedule interview: ${intError.message}` };
              break;
            }

            // Update application status
            await supabase
              .from('applications')
              .update({ status: 'interview' })
              .eq('id', application.id);

            result = {
              success: true,
              message: `Interview scheduled with ${candidate.full_name} for ${new Date(args.dateTime).toLocaleString()}`,
              interviewId: interview.id,
              candidateEmail: candidate.email,
              jobTitle: (application as any).jobs.title
            };
            break;
          }

          case 'send_email': {
            // Call the send-email function
            const { error } = await supabase.functions.invoke('send-email', {
              body: {
                to: args.candidateEmail,
                subject: args.subject,
                html: `<div style="font-family: Arial, sans-serif;">${args.message.replace(/\n/g, '<br>')}</div>`,
                emailType: 'manual'
              }
            });

            if (error) {
              result = { error: `Failed to send email: ${error.message}` };
            } else {
              result = { success: true, message: `Email sent to ${args.candidateEmail}` };
            }
            break;
          }

          default:
            result = { error: `Unknown function: ${functionName}` };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      // Make a second call with tool results
      const followUpResponse = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiapiApiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            assistantMessage,
            ...toolResults
          ],
        }),
      });

      if (!followUpResponse.ok) {
        throw new Error('Follow-up AI request failed');
      }

      const followUpData = await followUpResponse.json();
      return new Response(
        JSON.stringify({
          content: followUpData.choices?.[0]?.message?.content || 'Action completed.',
          toolsUsed: assistantMessage.tool_calls.map((tc: any) => tc.function.name)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No tool calls, return the direct response
    return new Response(
      JSON.stringify({
        content: assistantMessage?.content || 'I apologize, but I could not generate a response.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in hr-chat function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
