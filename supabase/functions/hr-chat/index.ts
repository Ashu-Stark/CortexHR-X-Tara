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

    // Check for available AI provider - priority: Google > OpenAI > Lovable (Forcing Google for this fix)
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI');
    const googleKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    // If Google Key is present, use it with Tool Support
    if (googleKey) {
      console.log("Using Google Gemini with Tools");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleKey}`;

      let systemInstruction = `You are an AI HR assistant. Use the provided tools to schedule interviews, look up candidates, or send emails. Be professional.`;

      // Convert tools to Gemini format
      const geminiTools = [{
        function_declarations: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }];

      // Process messages 
      const processedContents: any[] = [];
      for (const m of messages) {
        if (m.role === 'system') {
          systemInstruction += `\n${m.content}`;
          continue;
        }
        const role = m.role === 'assistant' ? 'model' : 'user';
        let parts = [{ text: m.content }];

        // Handle previous tool calls in history if we were tracking them (simplified for now as we just want current turn)
        // For simplistic chat history, we just map text content. 

        if (processedContents.length > 0 && processedContents[processedContents.length - 1].role === role) {
          processedContents[processedContents.length - 1].parts[0].text += `\n\n${m.content}`;
        } else {
          processedContents.push({ role, parts });
        }
      }
      if (processedContents.length === 0) processedContents.push({ role: 'user', parts: [{ text: "Hello" }] });

      const body: any = {
        contents: processedContents,
        system_instruction: { parts: [{ text: systemInstruction }] },
        tools: geminiTools
      };

      let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google API Init Failed: ${err}`);
      }

      let data = await response.json();
      let candidate = data.candidates?.[0];
      let content = candidate?.content;
      let parts = content?.parts || [];

      // Check for Function Calls
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        const toolDataParts = [];

        for (const part of functionCalls) {
          const fc = part.functionCall;
          const functionName = fc.name;
          const args = fc.args;

          console.log(`Gemini Function Call: ${functionName}`, args);

          let result;
          // Execute tool (Reuse existing switch logic by wrapping in a helper or copy-paste for safety)
          // Copying logic here for immediate stability
          try {
            switch (functionName) {
              case 'get_candidates': {
                let query = supabase.from('applications').select(`id,status,ai_score,candidates!inner(full_name, email),jobs!inner(title)`).order('created_at', { ascending: false }).limit(args.limit || 10);
                if (args.status) query = query.eq('status', args.status);
                const { data, error } = await query;
                if (error) throw error;
                result = data?.map((app: any) => ({ name: app.candidates.full_name, email: app.candidates.email, job: app.jobs.title, status: app.status, aiScore: app.ai_score })) || [];
                break;
              }
              case 'get_interviews': {
                const now = new Date();
                let query = supabase.from('interviews').select(`id,scheduled_at,duration_minutes,interview_type,status,meeting_url,applications!inner(candidates!inner(full_name, email),jobs!inner(title))`).order('scheduled_at', { ascending: true });
                if (args.upcoming) query = query.gte('scheduled_at', now.toISOString());
                const { data, error } = await query.limit(10);
                if (error) throw error;
                result = data?.map((int: any) => ({ candidateName: int.applications.candidates.full_name, jobTitle: int.applications.jobs.title, scheduledAt: int.scheduled_at, status: int.status })) || [];
                break;
              }
              case 'schedule_interview': {
                // Simplified lookup for brevity
                const { data: cands } = await supabase.from('candidates').select('id,email').ilike('full_name', `%${args.candidateName}%`).limit(1);
                if (!cands?.length) { result = { error: "Candidate not found" }; break; }
                const { data: apps } = await supabase.from('applications').select('id').eq('candidate_id', cands[0].id).limit(1);
                if (!apps?.length) { result = { error: "Application not found" }; break; }
                const { error: iErr } = await supabase.from('interviews').insert({ application_id: apps[0].id, scheduled_at: args.dateTime, duration_minutes: 60, status: 'scheduled' });
                result = iErr ? { error: iErr.message } : { success: true, message: `Scheduled for ${args.dateTime}` };
                break;
              }
              case 'send_email': {
                result = { success: true, message: `Email simulated to ${args.candidateEmail}` }; // Simplified for now
                break;
              }
              default:
                result = { error: "Unknown function" };
            }
          } catch (e: any) {
            result = { error: e.message };
          }

          toolDataParts.push({
            functionResponse: {
              name: functionName,
              response: { result: result }
            }
          });
        }

        // Send function results back to Gemini
        const followUpBody = {
          contents: [
            ...processedContents,
            { role: 'model', parts: parts }, // The model's request
            { role: 'function', parts: toolDataParts } // The tool outputs. Note: Role might be 'function' or 'user' depending on API version. v1beta usually uses 'function' or 'user' with 'functionResponse'. Let's try 'function'.
          ]
        };

        let followUp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(followUpBody)
        });

        if (!followUp.ok) {
          // Retry with 'user' role if 'function' fails (Gemini API flux)
          console.log("Retrying with user role for function response");
          followUpBody.contents[followUpBody.contents.length - 1].role = 'user';
          followUp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(followUpBody) });
        }

        if (followUp.ok) {
          const fData = await followUp.json();
          const fText = fData.candidates?.[0]?.content?.parts?.[0]?.text || "Action completed.";
          return new Response(JSON.stringify({ content: fText }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const text = parts[0]?.text || "I'm thinking...";
      return new Response(JSON.stringify({ content: text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fallback to OpenAI if Google Key is missing
    if (openaiKey) {
      const aiConfig = { apiKey: openaiKey, baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', provider: 'openai' };
      const aiResponse = await fetch(aiConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages,
          tools,
          tool_choice: 'auto',
        }),
      });

      if (!aiResponse.ok) {
        const err = await aiResponse.text();
        throw new Error(`OpenAI Failed: ${err}`);
      }

      const data = await aiResponse.json();
      const text = data.choices?.[0]?.message?.content || "Response generated via OpenAI.";
      return new Response(JSON.stringify({ content: text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error('No supported AI Provider found. Please ensure GOOGLE_API_KEY is set.');

  } catch (error: unknown) {
    console.error('Error in hr-chat function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
