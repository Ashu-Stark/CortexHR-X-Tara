import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Provider types
type AIProvider = 'aiapi' | 'openai' | 'huggingface';

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Detect available provider
function getAvailableProvider(): AIProvider {
  if (Deno.env.get('OPENAI_API_KEY')) return 'openai';
  if (Deno.env.get('HUGGINGFACE_API_KEY')) return 'huggingface';
  if (Deno.env.get('AIAPI_API_KEY')) return 'aiapi';
  throw new Error('No AI provider configured');
}

// Get provider config
function getProviderConfig(provider: AIProvider) {
  const configs = {
    aiapi: {
      baseUrl: 'https://ai.gateway.aiapi.dev/v1/chat/completions',
      model: 'google/gemini-2.5-flash',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('AIAPI_API_KEY')}`,
      }),
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      }),
    },
    huggingface: {
      baseUrl: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      model: 'Mixtral-8x7B',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_KEY')}`,
      }),
    },
  };
  return configs[provider];
}

// Make AI completion request
async function createAICompletion(messages: AIMessage[], provider: AIProvider): Promise<string> {
  const config = getProviderConfig(provider);

  if (provider === 'huggingface') {
    // HuggingFace has different format
    const prompt = messages.map(m => {
      if (m.role === 'system') return `<s>[INST] <<SYS>>\n${m.content}\n<</SYS>>\n\n`;
      if (m.role === 'user') return `${m.content} [/INST]`;
      return `${m.content} </s><s>[INST] `;
    }).join('');

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.getHeaders(),
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 4096, temperature: 0.3, return_full_text: false },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API failed: ${await response.text()}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
  }

  // OpenAI-compatible (Aiapi AI and OpenAI)
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: config.getHeaders(),
    body: JSON.stringify({ model: config.model, messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again later.');
    if (response.status === 402) throw new Error('AI credits exhausted. Please add funds.');
    throw new Error(`AI API failed: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeText, applicationId, jobRequirements } = await req.json();

    if (!resumeText || !applicationId) {
      return new Response(
        JSON.stringify({ error: 'Resume text and application ID are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing resume for application:', applicationId);

    const provider = getAvailableProvider();
    console.log('Using AI provider:', provider);

    const systemPrompt = `You are an expert senior HR recruiter with 25+ years of experience in technical and executive hiring across Fortune 500 companies. You analyze resumes with precision, objectivity, and deep industry knowledge.

Your scoring philosophy:
- Be GENEROUS but FAIR - assume positive intent and give credit for potential
- A score of 70+ indicates a strong candidate worth interviewing
- A score of 80+ indicates an exceptional candidate
- A score of 50-70 indicates a solid candidate with some gaps
- Only scores below 40 should indicate significant concerns
- Consider the candidate's career trajectory, not just current state
- Value diverse backgrounds and non-traditional paths
- Recognize transferable skills across industries

You MUST provide thorough justifications for every score, citing specific evidence from the resume.
Always extract contact information and profile URLs when present.
Return only valid JSON without any markdown formatting.`;

    const userPrompt = `Analyze this resume thoroughly and provide a comprehensive, structured assessment with detailed justifications.

## IMPORTANT SCORING GUIDELINES:
- Base your score on EVIDENCE found in the resume
- Be fair and generous - most candidates with relevant experience should score 60-80
- Cite specific examples from the resume for each score component
- Consider the overall picture, not just keywords
- A candidate doesn't need to be perfect to score well

## Scoring Breakdown (0-100 total):
- **Technical Skills (30 points max)**: Assess depth, breadth, relevance, and hands-on experience with technologies. Look for specific projects, tools, frameworks mentioned.
- **Experience Quality (25 points max)**: Evaluate career progression, impact achieved, responsibilities held, and relevance to typical roles. Look for quantified achievements.
- **Education & Certifications (15 points max)**: Consider formal education, bootcamps, online courses, certifications. Non-traditional paths can still score high if relevant.
- **Communication & Presentation (10 points max)**: How well is the resume written? Is it clear, well-organized, professional? Are achievements articulated effectively?
- **Cultural Fit Indicators (10 points max)**: Look for teamwork, leadership, mentoring, community involvement, adaptability, initiative.
- **Job Match (10 points max)**: If job requirements provided, how well does the candidate match? Otherwise, general employability.

## Required JSON Response Structure:
{
  "score": <0-100 overall score - sum of all breakdown points>,
  "score_breakdown": {
    "technical_skills": {
      "points": <0-30>,
      "justification": "<2-3 sentences citing specific skills, tools, or projects from resume>"
    },
    "experience_quality": {
      "points": <0-25>,
      "justification": "<2-3 sentences citing specific roles, achievements, or progression from resume>"
    },
    "education_certifications": {
      "points": <0-15>,
      "justification": "<1-2 sentences about education, courses, or certifications found>"
    },
    "communication_presentation": {
      "points": <0-10>,
      "justification": "<1-2 sentences about resume quality and clarity>"
    },
    "cultural_fit": {
      "points": <0-10>,
      "justification": "<1-2 sentences about teamwork, leadership, or soft skills indicators>"
    },
    "job_match": {
      "points": <0-10>,
      "justification": "<1-2 sentences about fit for typical roles or specific job if provided>"
    }
  },
  "score_justification": "<3-4 sentence comprehensive summary explaining the overall score. Start with the candidate's strongest points, then any gaps, and end with a hiring recommendation. Be specific and cite resume content.>",
  "summary": "<2-3 sentence executive summary of who this candidate is, their experience level, and key strengths. Write it as if briefing a hiring manager.>",
  "skills": [{"name": "<skill>", "level": "beginner|intermediate|advanced|expert", "years": <estimated years>}],
  "experience_years": <total years of professional experience>,
  "current_role": "<most recent job title>",
  "current_company": "<most recent company>",
  "education_level": "<highest education: High School|Associate|Bachelor|Master|PhD|Bootcamp|Self-taught>",
  "education_field": "<field of study>",
  "certifications": ["<certification1>", "<certification2>"],
  "languages": [{"language": "<lang>", "proficiency": "basic|conversational|professional|native"}],
  "strengths": ["<strength1 - be specific>", "<strength2>", "<strength3>"],
  "concerns": ["<genuine concern if any, or empty array>"],
  "red_flags": ["<only serious issues like unexplained gaps, or empty array>"],
  "recommendations": ["<hiring recommendation: Strongly recommend for interview | Recommend for interview | Consider for interview | Additional screening needed>"],
  "contact_info": {
    "email": "<extracted email or null>",
    "phone": "<extracted phone or null>",
    "location": "<city/country or null>"
  },
  "github_url": "<GitHub URL or null>",
  "linkedin_url": "<LinkedIn URL or null>",
  "portfolio_url": "<Portfolio URL or null>",
  "salary_expectation": "<if mentioned>",
  "availability": "<notice period if mentioned>",
  "interview_questions": [
    "<Question 1: Based on their specific experience, ask about a project or skill they mentioned>",
    "<Question 2: Explore a potential gap or area for growth you identified>",
    "<Question 3: Technical or behavioral question relevant to their background>"
  ]
}

${jobRequirements ? `## Job Requirements to Match Against:\n${jobRequirements}\n\nScore the job_match component based on how well this candidate fits these specific requirements.\n\n` : 'No specific job requirements provided - score job_match based on general employability and market fit.\n\n'}

## Resume Content:
${resumeText}

Analyze thoroughly and return ONLY valid JSON.`;

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const analysisText = await createAICompletion(messages, provider);

    if (!analysisText) {
      throw new Error('No analysis content received from AI');
    }

    console.log('AI response received, parsing...');

    // Parse JSON response
    let analysis;
    try {
      const cleanedText = analysisText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      analysis = {
        score: 55,
        score_breakdown: {
          technical_skills: { points: 15, justification: "Unable to fully assess - manual review needed" },
          experience_quality: { points: 12, justification: "Unable to fully assess - manual review needed" },
          education_certifications: { points: 8, justification: "Unable to fully assess - manual review needed" },
          communication_presentation: { points: 5, justification: "Unable to fully assess - manual review needed" },
          cultural_fit: { points: 5, justification: "Unable to fully assess - manual review needed" },
          job_match: { points: 10, justification: "Unable to fully assess - manual review needed" }
        },
        score_justification: "The AI was unable to fully parse this resume. The score of 55 is a neutral starting point. A manual review is strongly recommended to properly assess this candidate's qualifications and potential fit.",
        skills: [],
        summary: 'Resume parsing encountered issues. Manual review is recommended to properly evaluate this candidate.',
        experience_years: 0,
        current_role: 'Unknown',
        current_company: 'Unknown',
        education_level: 'Unknown',
        education_field: 'Unknown',
        certifications: [],
        languages: [],
        strengths: [],
        concerns: ['Automated parsing incomplete - requires human review'],
        red_flags: [],
        recommendations: ['Conduct manual resume review'],
        contact_info: { email: null, phone: null, location: null },
        github_url: null,
        linkedin_url: null,
        portfolio_url: null,
        salary_expectation: null,
        availability: null,
        interview_questions: []
      };
    }

    // Update database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: appData, error: appError } = await supabase
      .from('applications')
      .select('candidate_id')
      .eq('id', applicationId)
      .single();

    if (appError) {
      console.error('Error fetching application:', appError);
      throw appError;
    }

    // Build comprehensive summary with justification
    const fullSummary = `${analysis.summary}\n\n**AI Assessment:** ${analysis.score_justification}`;

    const aiSkillsData = {
      skills: analysis.skills,
      score_breakdown: analysis.score_breakdown,
      strengths: analysis.strengths,
      concerns: analysis.concerns,
      red_flags: analysis.red_flags,
      recommendations: analysis.recommendations,
      experience_years: analysis.experience_years,
      current_role: analysis.current_role,
      current_company: analysis.current_company,
      education_level: analysis.education_level,
      interview_questions: analysis.interview_questions,
      ai_provider: provider
    };

    const { error: updateError } = await supabase
      .from('applications')
      .update({
        ai_score: analysis.score,
        ai_skills: aiSkillsData,
        ai_summary: fullSummary,
        status: 'screening',
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    // Extract URLs with fallback regex
    let githubUrl = analysis.github_url || null;
    let linkedinUrl = analysis.linkedin_url || null;
    let portfolioUrl = analysis.portfolio_url || null;

    if (!githubUrl) {
      const githubMatch = resumeText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
      if (githubMatch) {
        githubUrl = githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`;
      }
    }

    if (!linkedinUrl) {
      const linkedinMatch = resumeText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
      if (linkedinMatch) {
        linkedinUrl = linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;
      }
    }

    if (appData?.candidate_id && (githubUrl || linkedinUrl || portfolioUrl)) {
      const candidateUpdate: Record<string, string | null> = {};
      if (githubUrl) candidateUpdate.github_url = githubUrl;
      if (linkedinUrl) candidateUpdate.linkedin_url = linkedinUrl;
      if (portfolioUrl) candidateUpdate.portfolio_url = portfolioUrl;

      await supabase.from('candidates').update(candidateUpdate).eq('id', appData.candidate_id);
    }

    console.log('Successfully updated application with AI analysis');

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        provider,
        extractedUrls: { github_url: githubUrl, linkedin_url: linkedinUrl, portfolio_url: portfolioUrl },
        message: 'Resume parsed and scored successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in parse-resume function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
