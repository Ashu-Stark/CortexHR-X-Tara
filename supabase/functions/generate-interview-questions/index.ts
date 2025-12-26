import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  applicationId: string;
  interviewType?: string;
  numberOfQuestions?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, interviewType = 'Technical', numberOfQuestions = 5 }: RequestBody = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'applicationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch application details with candidate and job info
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        ai_skills,
        ai_summary,
        candidates!inner(full_name, resume_text),
        jobs!inner(title, department, description, requirements)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Application fetch error:', appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidate = (application as any).candidates;
    const job = (application as any).jobs;

    const aiapiApiKey = Deno.env.get('AIAPI_API_KEY');
    if (!aiapiApiKey) {
      throw new Error('AIAPI_API_KEY not configured');
    }

    const systemPrompt = `You are an expert HR interviewer. Generate interview questions based on the candidate's profile and job requirements.

Interview Type: ${interviewType}
Number of Questions: ${numberOfQuestions}

For Technical interviews, focus on:
- Specific technical skills mentioned in the resume
- Problem-solving abilities
- Past project experience

For Behavioral interviews, focus on:
- Leadership and teamwork
- Conflict resolution
- Adaptability and growth mindset

For HR Screen interviews, focus on:
- Cultural fit
- Career goals
- Salary expectations
- Availability

For Final interviews, focus on:
- Strategic thinking
- Long-term vision
- Deep dive into experience`;

    const userPrompt = `Generate ${numberOfQuestions} ${interviewType} interview questions for:

CANDIDATE: ${candidate.full_name}
POSITION: ${job.title} (${job.department})

JOB DESCRIPTION:
${job.description || 'Not provided'}

JOB REQUIREMENTS:
${job.requirements || 'Not provided'}

CANDIDATE SKILLS (from AI analysis):
${JSON.stringify(application.ai_skills) || 'Not analyzed'}

CANDIDATE SUMMARY:
${application.ai_summary || 'Not available'}

RESUME EXCERPT:
${candidate.resume_text?.substring(0, 2000) || 'Not available'}

Generate questions that are:
1. Specific to this candidate's background
2. Relevant to the job requirements
3. Mix of easy, medium, and challenging
4. Include follow-up prompts where appropriate`;

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
              name: "interview_questions",
              description: "Return structured interview questions",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "The interview question" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                        category: { type: "string", description: "Question category" },
                        followUp: { type: "string", description: "Optional follow-up question" },
                        expectedInsights: { type: "string", description: "What to look for in the answer" }
                      },
                      required: ["question", "difficulty", "category"]
                    }
                  }
                },
                required: ["questions"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "interview_questions" } }
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

      throw new Error(`AI request failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error('No questions generated');
    }

    const result = JSON.parse(toolCall.function.arguments);

    console.log(`Generated ${result.questions.length} interview questions for application ${applicationId}`);

    return new Response(
      JSON.stringify({
        success: true,
        candidateName: candidate.full_name,
        jobTitle: job.title,
        interviewType,
        questions: result.questions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating interview questions:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
