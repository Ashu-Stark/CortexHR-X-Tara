import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractJson, fallbackAnalysis, normalizeAnalysis, truncateResume } from "../_shared/scoring.ts";
import { buildScoringPrompts } from "../_shared/scoring-prompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Provider types
type AIProvider = 'lovable' | 'openai' | 'huggingface' | 'google' | 'groq' | 'mistral';

// ... lines 13-44 ...

// Detect available provider - checks both OPENAI_API_KEY and openAI (alternate naming)
function getAvailableProvider(): AIProvider {
  if (Deno.env.get('GROQ_API_KEY')) return 'groq';
  if (Deno.env.get('MISTRAL_API_KEY')) return 'mistral';
  if (Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')) return 'google';
  if (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')) return 'openai';
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
        'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')?.split(',')[0]}`, // Handle comma-separated list
      }),
    },
    mistral: {
      baseUrl: 'https://api.mistral.ai/v1/chat/completions',
      model: 'mistral-large-latest',
      getHeaders: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('MISTRAL_API_KEY')}`,
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

  if (provider === 'groq') {
    // Implement Key Rotation for Groq
    const envKeys = Deno.env.get('GROQ_API_KEY') || '';
    const apiKeys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    let lastError: Error | null = null;

    for (const apiKey of apiKeys) {
      try {
        const response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';

      } catch (err: any) {
        console.warn(`Groq Key ${apiKey.substring(0, 8)}... failed: ${err.message}`);
        lastError = err;
        // continue to next key
      }
    }
    throw lastError || new Error('All Groq keys failed');
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

  // OpenAI / Mistral / Lovable (Standard OpenAI Compatible APIs)
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

    // Truncate resume text to prevent context window issues (approx 6-8k tokens)
    const truncatedResumeText = truncateResume(resumeText);

    if (!truncatedResumeText && !githubData?.user) {
      console.error('No resume text and no GitHub data found. Returning 0 score.');
      // Return a controlled "0" score instead of random error
      return new Response(
        JSON.stringify({
          success: true,
          analysis: {
            score: 0,
            score_justification: "No content could be extracted from the resume file. Please ensure it is a readable PDF or clear image.",
            summary: "Resume extraction failed.",
            hiring_verdict: "PASS"
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { systemPrompt, userPrompt } = buildScoringPrompts({ truncatedResumeText, githubContent, hasGitHub, jobRequirements });

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let analysisText: string = '';

    // Define fallback order
    const priorityOrder: AIProvider[] = ['groq', 'mistral', 'google', 'openai', 'lovable'];

    for (const p of priorityOrder) {
      // Check if provider has key configured
      let hasKey = false;
      if (p === 'groq' && Deno.env.get('GROQ_API_KEY')) hasKey = true;
      else if (p === 'mistral' && Deno.env.get('MISTRAL_API_KEY')) hasKey = true;
      else if (p === 'google' && (Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY'))) hasKey = true;
      else if (p === 'openai' && (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI'))) hasKey = true;
      else if (p === 'lovable' && Deno.env.get('LOVABLE_API_KEY')) hasKey = true;

      if (!hasKey) continue;

      try {
        console.log(`Attempting analysis with provider: ${p}`);
        analysisText = await createAICompletion(messages, p);

        if (analysisText && analysisText.length > 10) {
          console.log(`Success with ${p}, response length: ${analysisText.length}`);
          break; // Stop if successful
        } else {
          console.warn(`Provider ${p} returned empty/short response.`);
        }
      } catch (aiError: any) {
        console.error(`Provider ${p} failed:`, aiError.message || aiError);
        // Continue to next provider
      }
    }

    if (!analysisText) {
      console.error('All AI providers failed to generate text.');
      // This will trigger the fallback JSON logic below
    }

    // Parse JSON response or use fallback (helpers in ../_shared/scoring.ts, unit-tested)
    let analysis;
    try {
      const raw = extractJson(analysisText);
      const { analysis: normalized, corrections } = normalizeAnalysis(raw);
      if (corrections.length) console.log('Score corrections:', corrections.join('; '));
      analysis = normalized;
    } catch (parseError: any) {
      console.error('JSON parse/Analysis error:', parseError?.message || parseError);
      analysis = fallbackAnalysis(parseError?.message || 'unknown error');
      analysis.hiring_verdict = 'MAYBE';
      analysis.interview_questions = [];
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
