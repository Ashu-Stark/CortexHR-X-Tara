import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchRequest {
  subject?: string;
  body?: string;
  source?: string; // 'email', 'linkedin', 'indeed', etc.
  candidateName?: string;
}

interface JobMatch {
  jobId: string;
  jobTitle: string;
  department: string;
  confidence: number;
  matchReason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { subject, body, source, candidateName }: MatchRequest = await req.json();

    console.log(`Job matching request - Source: ${source}, Subject: ${subject?.substring(0, 50)}`);

    // Get all active jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, title, department, requirements, description')
      .eq('is_active', true);

    if (jobsError || !jobs?.length) {
      console.log('No active jobs found');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No active jobs found',
          match: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Combine content for analysis
    const contentToAnalyze = `${subject || ''} ${body || ''}`.toLowerCase();

    // First try exact/partial title matching
    const matches: JobMatch[] = [];

    for (const job of jobs) {
      const titleLower = job.title.toLowerCase();
      const deptLower = job.department.toLowerCase();
      const titleWords = titleLower.split(/\s+/).filter((w: string) => w.length > 2);

      let confidence = 0;
      const reasons: string[] = [];

      // Check for exact title match
      if (contentToAnalyze.includes(titleLower)) {
        confidence += 60;
        reasons.push('Exact title match');
      }

      // Check for partial title matches (individual words)
      const matchedWords = titleWords.filter((word: string) => contentToAnalyze.includes(word));
      if (matchedWords.length > 0) {
        confidence += (matchedWords.length / titleWords.length) * 30;
        reasons.push(`Title keywords: ${matchedWords.join(', ')}`);
      }

      // Check for department match
      if (contentToAnalyze.includes(deptLower)) {
        confidence += 15;
        reasons.push('Department match');
      }

      // Check for role-specific keywords
      const roleKeywords: Record<string, string[]> = {
        'software engineer': ['developer', 'programmer', 'coding', 'javascript', 'python', 'react', 'node', 'backend', 'frontend', 'fullstack', 'full-stack', 'software'],
        'product manager': ['product', 'pm', 'roadmap', 'strategy', 'stakeholder', 'agile', 'scrum'],
        'ux designer': ['design', 'ux', 'ui', 'figma', 'sketch', 'user experience', 'wireframe', 'prototype'],
        'devops engineer': ['devops', 'infrastructure', 'aws', 'kubernetes', 'docker', 'ci/cd', 'cloud', 'terraform'],
        'data analyst': ['data', 'analytics', 'sql', 'tableau', 'bi', 'visualization', 'metrics', 'dashboard'],
        'marketing': ['marketing', 'campaign', 'seo', 'content', 'social media', 'growth'],
        'sales': ['sales', 'account', 'business development', 'quota', 'revenue'],
        'hr': ['hr', 'human resources', 'recruiting', 'talent', 'people operations'],
      };

      for (const [role, keywords] of Object.entries(roleKeywords)) {
        if (titleLower.includes(role.split(' ')[0])) {
          const matchedKeywords = keywords.filter(kw => contentToAnalyze.includes(kw));
          if (matchedKeywords.length > 0) {
            confidence += matchedKeywords.length * 5;
            reasons.push(`Role keywords: ${matchedKeywords.slice(0, 3).join(', ')}`);
          }
        }
      }

      // Check for LinkedIn-specific patterns
      if (source === 'linkedin' && contentToAnalyze.includes('linkedin')) {
        // LinkedIn applications often have specific patterns
        if (contentToAnalyze.includes('applied') || contentToAnalyze.includes('application')) {
          confidence += 5;
          reasons.push('LinkedIn application pattern');
        }
      }

      // Check for Indeed-specific patterns
      if (source === 'indeed' && (contentToAnalyze.includes('indeed') || contentToAnalyze.includes('indeedapply'))) {
        confidence += 5;
        reasons.push('Indeed application pattern');
      }

      if (confidence > 0) {
        matches.push({
          jobId: job.id,
          jobTitle: job.title,
          department: job.department,
          confidence: Math.min(confidence, 100),
          matchReason: reasons.join('; '),
        });
      }
    }

    // Sort by confidence and get best match
    matches.sort((a, b) => b.confidence - a.confidence);

    let bestMatch: JobMatch | null = null;

    if (matches.length > 0 && matches[0].confidence >= 20) {
      bestMatch = matches[0];
      console.log(`Best match: ${bestMatch.jobTitle} (${bestMatch.confidence}% confidence)`);
    } else {
      // If no good match, use AI to determine best fit
      console.log('No strong match found, using AI to determine best fit...');

      const openaiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI');
      const googleKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY');
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

      const apiKey = openaiKey || googleKey || lovableApiKey;

      if (apiKey) {
        try {
          const jobList = jobs.map(j => `- ${j.title} (${j.department}): ${j.requirements?.substring(0, 100) || 'No requirements listed'}`).join('\n');

          let url = 'https://ai.gateway.lovable.dev/v1/chat/completions';
          let body: any = {};
          let headers: any = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          };

          if (openaiKey || lovableApiKey) {
            if (openaiKey) {
              url = 'https://api.openai.com/v1/chat/completions';
            }
            body = {
              model: openaiKey ? 'gpt-4o-mini' : 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `You are a job matching expert. Analyze the content and match to:
${jobList}

Respond ONLY with JSON: { "bestJobTitle": "exact title", "confidence": 0-100, "reason": "why" }`
                },
                {
                  role: 'user',
                  content: `Subject: ${subject || ''}\nBody: ${body?.substring(0, 1000) || ''}\nSource: ${source || ''}\nCandidate: ${candidateName || ''}`
                }
              ],
              temperature: 0,
            };
          } else if (googleKey) {
            // Google API format
            url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleKey}`;
            delete headers['Authorization']; // Google uses query param
            body = {
              contents: [{
                parts: [{
                  text: `You are a job matching expert. Analyze the content and match to one of these jobs:
${jobList}

Respond ONLY with valid JSON (no markdown formatting): { "bestJobTitle": "exact title", "confidence": <number>, "reason": "string" }.

Email/Application content:
Subject: ${subject || ''}
Body: ${body?.substring(0, 1000) || ''}
Source: ${source || ''}
Candidate: ${candidateName || ''}`
                }]
              }]
            };
          }

          const aiResponse = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            let aiContent = '';

            if (openaiKey || lovableApiKey) {
              aiContent = aiData.choices?.[0]?.message?.content || '';
            } else {
              // Google response format
              aiContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }

            // Parse AI response
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.bestJobTitle) {
                const matchedJob = jobs.find(j =>
                  j.title.toLowerCase() === parsed.bestJobTitle.toLowerCase()
                );
                if (matchedJob && parsed.confidence >= 30) {
                  bestMatch = {
                    jobId: matchedJob.id,
                    jobTitle: matchedJob.title,
                    department: matchedJob.department,
                    confidence: parsed.confidence,
                    matchReason: `AI analysis: ${parsed.reason}`,
                  };
                  console.log(`AI match: ${bestMatch.jobTitle} (${bestMatch.confidence}%)`);
                }
              }
            }
          } else {
            console.log("AI Request failed", await aiResponse.text());
          }
        } catch (aiError) {
          console.error('AI matching error:', aiError);
        }
      }
    }

    // If still no match, default to first active job
    if (!bestMatch && jobs.length > 0) {
      bestMatch = {
        jobId: jobs[0].id,
        jobTitle: jobs[0].title,
        department: jobs[0].department,
        confidence: 10,
        matchReason: 'Default fallback - no specific job detected',
      };
      console.log(`Fallback to default job: ${bestMatch.jobTitle}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        match: bestMatch,
        allMatches: matches.slice(0, 5), // Return top 5 matches for debugging
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in match-job-from-content:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
