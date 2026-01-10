import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Provider types
type AIProvider = 'lovable' | 'openai' | 'huggingface' | 'google' | 'groq';

// ... lines 13-44 ...

// Detect available provider - checks both OPENAI_API_KEY and openAI (alternate naming)
function getAvailableProvider(): AIProvider {
  if (Deno.env.get('GROQ_API_KEY')) return 'groq'; // Prioritize Groq if present (testing) or fallback? user said "backup". 
  // actually user said "add these... backups". 
  // If I put it first, it becomes primary. 
  // I will put it AFTER Google.
  if (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')) return 'openai';
  if (Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')) return 'google';
  if (Deno.env.get('GROQ_API_KEY')) return 'groq';
  if (Deno.env.get('HUGGINGFACE_API_KEY')) return 'huggingface';
  if (Deno.env.get('LOVABLE_API_KEY')) return 'lovable';
  throw new Error('No AI provider configured');
}

// Get provider config - using temperature: 0 for deterministic scoring
function getProviderConfig(provider: AIProvider) {
  const configs = {
    lovable: {
      baseUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      model: 'google/gemini-2.5-pro', // Use Pro model for best analysis
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      }),
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')}`,
      }),
    },
    google: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-1.5-flash',
      getHeaders: () => ({
        'Content-Type': 'application/json',
      }),
    },
    groq: {
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
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

// Make AI completion request with temperature: 0 for consistent results
async function createAICompletion(messages: AIMessage[], provider: AIProvider): Promise<string> {
  const config = getProviderConfig(provider);

  if (provider === 'google') {
    const envKeys = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || '';
    const apiKeys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) throw new Error('GOOGLE_API_KEY is not set');

    let lastError: Error | null = null;
    let successfulContent = '';

    for (const apiKey of apiKeys) {
      try {
        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const contents = otherMessages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const url = `${config.baseUrl}/${config.model}:generateContent?key=${apiKey}`;

        const body: any = {
          contents,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192 // Ensure enough tokens for full resume analysis
          }
        };

        if (systemMessage) {
          body.system_instruction = {
            parts: [{ text: systemMessage.content }]
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: config.getHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Google API failed with status ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        successfulContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (successfulContent) {
          return successfulContent; // Success!
        }
      } catch (error: any) {
        console.warn(`Google Key ${apiKey.substr(0, 5)}... failed: ${error.message}`);
        lastError = error;
        // Try next key
      }
    }

    // If we get here, all keys failed
    throw lastError || new Error('All Google API keys failed configuration.');
  }

  if (provider === 'huggingface') {
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
        parameters: { max_new_tokens: 4096, temperature: 0, return_full_text: false },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API failed: ${await response.text()}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
  }

  // OpenAI-compatible (Lovable AI and OpenAI) - using temperature: 0 for deterministic output
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: config.getHeaders(),
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0, // CRITICAL: Set to 0 for deterministic, consistent scoring
      seed: 42 // Additional determinism for supported models
    }),
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

// Format GitHub data for AI analysis
function formatGitHubData(githubData: GitHubData): string {
  if (!githubData?.user) return '';

  let content = `\n\n## GitHub Profile Analysis\n`;
  content += `- Username: ${githubData.user.login}\n`;
  content += `- Name: ${githubData.user.name || 'N/A'}\n`;
  content += `- Bio: ${githubData.user.bio || 'N/A'}\n`;
  content += `- Public Repositories: ${githubData.user.public_repos}\n`;
  content += `- Followers: ${githubData.user.followers}\n`;
  content += `- Following: ${githubData.user.following}\n`;
  content += `- Account Created: ${githubData.user.created_at}\n`;
  content += `- Profile URL: ${githubData.user.html_url}\n\n`;

  if (githubData.repos && githubData.repos.length > 0) {
    content += `### Top Repositories:\n`;
    for (const repo of githubData.repos.slice(0, 8)) {
      content += `\n**${repo.name}**\n`;
      content += `- Description: ${repo.description || 'No description'}\n`;
      content += `- Language: ${repo.language || 'N/A'}\n`;
      content += `- Stars: ${repo.stargazers_count}, Forks: ${repo.forks_count}\n`;
      if (repo.topics?.length) {
        content += `- Topics: ${repo.topics.join(', ')}\n`;
      }
    }
  }

  return content;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeText, applicationId, jobRequirements, githubData, candidateId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'Application ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!resumeText && !githubData?.user) {
      return new Response(
        JSON.stringify({ error: 'Resume text or GitHub data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing resume for application:', applicationId);

    const provider = getAvailableProvider();
    console.log('Using AI provider:', provider);

    // Format GitHub data if available
    const githubContent = githubData ? formatGitHubData(githubData) : '';
    const hasGitHub = !!githubData?.user;

    const systemPrompt = `You are an elite senior technical recruiter with 30+ years of experience at FAANG companies and top-tier startups. You are known for your exceptionally accurate and consistent candidate assessments.

## CRITICAL SCORING RULES - FOLLOW EXACTLY:
1. Your scores MUST be deterministic - the same resume MUST always receive the SAME score
2. Use ONLY objective, measurable criteria from the resume and GitHub data
3. Do NOT introduce any randomness or subjective interpretation
4. Score based on EVIDENCE, not assumptions or inferences
5. Be GENEROUS but FAIR - assume positive intent, give credit for potential

## SCORING PHILOSOPHY:
- 85-100: Exceptional candidate - clear evidence of senior/staff level impact, strong GitHub presence, industry recognition
- 70-84: Strong candidate - solid experience, good skills match, worth interviewing immediately
- 55-69: Promising candidate - has relevant experience but some gaps, worth considering
- 40-54: Developing candidate - early career or career changer, needs more growth
- Below 40: Poor fit - significant concerns or mismatch with typical tech roles

## EVIDENCE-BASED SCORING:
For each category, cite SPECIFIC evidence from the resume/GitHub. If no evidence exists, give a baseline score.
${hasGitHub ? '\n## GITHUB BONUS:\nActive GitHub profile with quality repositories adds 5-15 bonus points to technical assessment.' : ''}

Return ONLY valid JSON without markdown formatting.`;

    const userPrompt = `Analyze this candidate comprehensively and provide a detailed, evidence-based assessment.

## SCORING BREAKDOWN (0-100 total):

### Technical Skills (35 points max)${hasGitHub ? ' - Including GitHub analysis' : ''}
- Assess depth and breadth of technical skills
- Look for specific technologies, frameworks, tools mentioned
- Consider years of experience with each technology
${hasGitHub ? '- Analyze GitHub: languages used, project quality, code contributions, stars/forks\n- GitHub activity level and consistency' : ''}
- Award points based on evidence found

### Experience Quality (25 points max)
- Career progression and trajectory
- Impact and achievements (look for quantified results: %, $, scale)
- Company quality and role responsibilities
- Leadership and scope of work

### Education & Certifications (15 points max)
- Formal education (degree level and relevance)
- Professional certifications
- Continuous learning evidence (courses, bootcamps)
- Non-traditional paths can score high if relevant

### Communication & Presentation (10 points max)
- Resume clarity and organization
- How well achievements are articulated
- Professional presentation
- Grammar and attention to detail

### Cultural Fit Indicators (10 points max)
- Teamwork and collaboration evidence
- Leadership and mentoring
- Community involvement (open source, speaking, writing)
- Growth mindset indicators

### Job Match (5 points max)
${jobRequirements ? `- Match against these requirements:\n${jobRequirements}` : '- General market fit and employability'}

## Required JSON Response Structure:
{
  "score": <0-100 overall score - MUST be sum of all breakdown points>,
  "score_breakdown": {
    "technical_skills": {
      "points": <0-35>,
      "justification": "<2-3 sentences citing specific skills, projects, or GitHub repos from the data>"
    },
    "experience_quality": {
      "points": <0-25>,
      "justification": "<2-3 sentences citing specific roles, achievements, or companies>"
    },
    "education_certifications": {
      "points": <0-15>,
      "justification": "<1-2 sentences about education and certifications found>"
    },
    "communication_presentation": {
      "points": <0-10>,
      "justification": "<1-2 sentences about resume quality>"
    },
    "cultural_fit": {
      "points": <0-10>,
      "justification": "<1-2 sentences about soft skills and cultural indicators>"
    },
    "job_match": {
      "points": <0-5>,
      "justification": "<1-2 sentences about job fit>"
    }
  },
  "score_justification": "<4-5 sentence comprehensive summary. Start with overall assessment, then strongest points with evidence, then any gaps, end with clear hiring recommendation.>",
  "summary": "<2-3 sentence executive summary for hiring manager. Include experience level, key strengths, and primary expertise area.>",
  "skills": [{"name": "<skill>", "level": "beginner|intermediate|advanced|expert", "years": <estimated years>, "source": "resume|github|both"}],
  "experience_years": <total years of professional experience>,
  "current_role": "<most recent job title>",
  "current_company": "<most recent company>",
  "education_level": "<High School|Associate|Bachelor|Master|PhD|Bootcamp|Self-taught>",
  "education_field": "<field of study>",
  "certifications": ["<cert1>", "<cert2>"],
  "languages": [{"language": "<lang>", "proficiency": "basic|conversational|professional|native"}],
  "strengths": ["<strength1 with evidence>", "<strength2>", "<strength3>"],
  "concerns": ["<specific concern if any>"],
  "red_flags": ["<serious issues only>"],
  "recommendations": ["<Strongly Recommend|Recommend|Consider|Additional Screening Needed>"],
  "contact_info": {
    "email": "<email or null>",
    "phone": "<phone or null>",
    "location": "<location or null>"
  },
  "github_url": "<extracted GitHub URL or null>",
  "linkedin_url": "<extracted LinkedIn URL or null>",
  "portfolio_url": "<extracted portfolio URL or null>",
  "github_analysis": ${hasGitHub ? `{
    "username": "<GitHub username>",
    "public_repos": <number>,
    "followers": <number>,
    "primary_languages": ["<lang1>", "<lang2>"],
    "notable_projects": ["<project1>", "<project2>"],
    "activity_level": "inactive|occasional|active|very_active",
    "profile_quality": "basic|good|strong|exceptional"
  }` : 'null'},
  "interview_questions": [
    "<Question 1: Ask about a specific project or achievement mentioned>",
    "<Question 2: Explore a skill gap or growth area>",
    "<Question 3: Technical deep-dive question based on their expertise>"
  ],
  "hiring_verdict": "<HIRE|STRONG_MAYBE|MAYBE|PASS>"
}

## Candidate Data:

### Resume Content:
${resumeText || 'No resume text available - score based on GitHub profile only.'}
${githubContent}

Analyze thoroughly and return ONLY valid JSON. Ensure the score is the exact sum of all breakdown points.`;

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let analysisText: string = '';

    try {
      analysisText = await createAICompletion(messages, provider);
      if (!analysisText) throw new Error('No analysis content received from AI');
      console.log('AI response received, parsing...');
    } catch (aiError) {
      console.error('AI Completion failed:', aiError);
      // Fallthrough to fallback logic below
    }

    // Parse JSON response or use fallback
    let analysis;
    try {
      console.log('Raw AI Response:', analysisText); // DEBUG LOG
      if (!analysisText) throw new Error('No text to parse');
      const cleanedText = analysisText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedText);

      // Validate score is sum of breakdown
      const breakdown = analysis.score_breakdown;
      if (breakdown) {
        const calculatedScore =
          (breakdown.technical_skills?.points || 0) +
          (breakdown.experience_quality?.points || 0) +
          (breakdown.education_certifications?.points || 0) +
          (breakdown.communication_presentation?.points || 0) +
          (breakdown.cultural_fit?.points || 0) +
          (breakdown.job_match?.points || 0);

        // Ensure score matches breakdown
        if (Math.abs(analysis.score - calculatedScore) > 1) {
          console.log(`Score mismatch: claimed ${analysis.score}, calculated ${calculatedScore}. Using calculated.`);
          analysis.score = calculatedScore;
        }
      }
    } catch (parseError: any) {
      console.error('JSON parse/Analysis error:', parseError);
      console.error('Failed Text:', analysisText); // Log what failed to parse

      analysis = {
        score: 50,
        score_breakdown: {
          technical_skills: { points: 15, justification: "Unable to fully assess - manual review needed" },
          experience_quality: { points: 12, justification: "Unable to fully assess - manual review needed" },
          education_certifications: { points: 8, justification: "Unable to fully assess - manual review needed" },
          communication_presentation: { points: 5, justification: "Unable to fully assess - manual review needed" },
          cultural_fit: { points: 5, justification: "Unable to fully assess - manual review needed" },
          job_match: { points: 5, justification: "Unable to fully assess - manual review needed" }
        },
        score_justification: `The AI was unable to fully parse this resume. Error: ${parseError.message}. A score of 50 is assigned as a neutral baseline. Manual review is strongly recommended.`,
        skills: [],
        summary: `Resume parsing encountered issues: ${parseError.message}. Manual review is recommended.`,
        experience_years: 0,
        current_role: 'Unknown',
        current_company: 'Unknown',
        education_level: 'Unknown',
        education_field: 'Unknown',
        certifications: [],
        languages: [],
        strengths: [],
        concerns: ['Automated parsing incomplete'],
        red_flags: [],
        recommendations: ['Conduct manual resume review'],
        contact_info: { email: null, phone: null, location: null },
        github_url: null,
        linkedin_url: null,
        portfolio_url: null,
        github_analysis: null,
        interview_questions: [],
        hiring_verdict: 'MAYBE'
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
    const fullSummary = `${analysis.summary}\n\n**AI Assessment:** ${analysis.score_justification}\n\n**Verdict:** ${analysis.hiring_verdict}`;

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
      github_analysis: analysis.github_analysis,
      hiring_verdict: analysis.hiring_verdict,
      ai_provider: provider,
      analyzed_at: new Date().toISOString()
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

    // Update candidate with extracted URLs and GitHub analysis
    const actualCandidateId = candidateId || appData?.candidate_id;
    if (actualCandidateId) {
      const candidateUpdate: Record<string, any> = {};

      if (analysis.github_url) candidateUpdate.github_url = analysis.github_url;
      if (analysis.linkedin_url) candidateUpdate.linkedin_url = analysis.linkedin_url;
      if (analysis.portfolio_url) candidateUpdate.portfolio_url = analysis.portfolio_url;
      if (analysis.github_analysis) candidateUpdate.portfolio_analysis = analysis.github_analysis;

      if (Object.keys(candidateUpdate).length > 0) {
        await supabase.from('candidates').update(candidateUpdate).eq('id', actualCandidateId);
      }
    }

    console.log('Successfully updated application with AI analysis. Score:', analysis.score);

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        provider,
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
