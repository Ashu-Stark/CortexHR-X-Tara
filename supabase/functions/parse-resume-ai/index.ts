import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeText } = await req.json();

    if (!resumeText) {
      return new Response(
        JSON.stringify({ error: 'Resume text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const AIAPI_API_KEY = Deno.env.get('AIAPI_API_KEY');
    if (!AIAPI_API_KEY) {
      throw new Error('AIAPI_API_KEY is not configured');
    }

    console.log('Parsing resume with AI...');

    const response = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert resume parser. Extract and structure resume information accurately. Return a JSON object with the following structure:
{
  "name": "Full name of the candidate",
  "email": "Email address or null",
  "phone": "Phone number or null",
  "location": "City, State/Country or null",
  "summary": "Professional summary or objective statement",
  "experience": [
    {
      "title": "Job title",
      "company": "Company name",
      "duration": "Date range",
      "description": "Brief description of responsibilities"
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "institution": "School/University name",
      "year": "Graduation year or date range"
    }
  ],
  "skills": ["skill1", "skill2", ...],
  "certifications": ["cert1", "cert2", ...],
  "languages": ["language1", "language2", ...],
  "github_url": "GitHub profile URL if found (e.g., https://github.com/username) or null",
  "linkedin_url": "LinkedIn profile URL if found (e.g., https://linkedin.com/in/username) or null",
  "portfolio_url": "Personal portfolio/website URL if found or null"
}

Be thorough and extract all relevant information. Look carefully for GitHub, LinkedIn, and portfolio links - they may appear in the header, contact section, or anywhere in the resume. If a section is not found, use null or empty array.`
          },
          {
            role: 'user',
            content: `Parse this resume and extract structured information:\n\n${resumeText}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'parse_resume',
              description: 'Parse resume and return structured data',
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Full name of the candidate' },
                  email: { type: 'string', nullable: true },
                  phone: { type: 'string', nullable: true },
                  location: { type: 'string', nullable: true },
                  summary: { type: 'string', nullable: true },
                  experience: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        company: { type: 'string' },
                        duration: { type: 'string' },
                        description: { type: 'string' }
                      },
                      required: ['title', 'company']
                    }
                  },
                  education: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        degree: { type: 'string' },
                        institution: { type: 'string' },
                        year: { type: 'string' }
                      },
                      required: ['degree', 'institution']
                    }
                  },
                  skills: { type: 'array', items: { type: 'string' } },
                  certifications: { type: 'array', items: { type: 'string' } },
                  languages: { type: 'array', items: { type: 'string' } },
                  github_url: { type: 'string', nullable: true, description: 'GitHub profile URL' },
                  linkedin_url: { type: 'string', nullable: true, description: 'LinkedIn profile URL' },
                  portfolio_url: { type: 'string', nullable: true, description: 'Personal portfolio/website URL' }
                },
                required: ['name', 'experience', 'education', 'skills']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'parse_resume' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract the parsed resume from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsedResume = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ parsedResume }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to message content if no tool call
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsedResume = JSON.parse(content);
        return new Response(
          JSON.stringify({ parsedResume }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch {
        console.error('Failed to parse AI response as JSON');
      }
    }

    throw new Error('Failed to parse resume');
  } catch (error) {
    console.error('Error in parse-resume-ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse resume';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
