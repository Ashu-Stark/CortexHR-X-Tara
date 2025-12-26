import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GitHubUser {
  login: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  description: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  topics: string[];
  updated_at: string;
}

async function fetchGitHubProfile(username: string): Promise<{ user: GitHubUser | null; repos: GitHubRepo[] }> {
  try {
    const userResponse = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!userResponse.ok) {
      console.error('GitHub user fetch failed:', userResponse.status);
      return { user: null, repos: [] };
    }

    const user = await userResponse.json();

    const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    const repos = reposResponse.ok ? await reposResponse.json() : [];

    return { user, repos };
  } catch (error) {
    console.error('Error fetching GitHub profile:', error);
    return { user: null, repos: [] };
  }
}

function extractGitHubUsername(url: string): string | null {
  const patterns = [
    /github\.com\/([^\/\?]+)/i,
    /^([a-zA-Z0-9-]+)$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateId, githubUrl, portfolioUrl } = await req.json();

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'Candidate ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const AIAPI_API_KEY = Deno.env.get('AIAPI_API_KEY');
    if (!AIAPI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing portfolio for candidate:', candidateId);

    let githubData = null;
    let portfolioContent = '';

    // Fetch GitHub data if URL provided
    if (githubUrl) {
      const username = extractGitHubUsername(githubUrl);
      if (username) {
        console.log('Fetching GitHub profile for:', username);
        githubData = await fetchGitHubProfile(username);

        if (githubData.user) {
          portfolioContent += `\n\n## GitHub Profile Analysis\n`;
          portfolioContent += `- Username: ${githubData.user.login}\n`;
          portfolioContent += `- Name: ${githubData.user.name || 'N/A'}\n`;
          portfolioContent += `- Bio: ${githubData.user.bio || 'N/A'}\n`;
          portfolioContent += `- Public Repos: ${githubData.user.public_repos}\n`;
          portfolioContent += `- Followers: ${githubData.user.followers}\n`;
          portfolioContent += `- Account Created: ${githubData.user.created_at}\n\n`;

          portfolioContent += `### Top Repositories:\n`;
          for (const repo of githubData.repos.slice(0, 5)) {
            portfolioContent += `- **${repo.name}**: ${repo.description || 'No description'}\n`;
            portfolioContent += `  - Language: ${repo.language || 'N/A'}\n`;
            portfolioContent += `  - Stars: ${repo.stargazers_count}, Forks: ${repo.forks_count}\n`;
            if (repo.topics?.length) {
              portfolioContent += `  - Topics: ${repo.topics.join(', ')}\n`;
            }
          }
        }
      }
    }

    if (!portfolioContent) {
      return new Response(
        JSON.stringify({ error: 'No valid portfolio data found to analyze' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze with AI
    console.log('Sending to AI for analysis...');
    const aiResponse = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
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
            content: `You are a technical recruiter AI assistant that analyzes developer portfolios and GitHub profiles. 
Provide insights on:
1. Technical skill level (beginner/intermediate/advanced/expert)
2. Primary technologies and languages
3. Project quality and diversity
4. Open source contributions
5. Areas of expertise
6. Potential red flags or concerns
7. Overall recommendation for hiring

Be concise but thorough. Focus on actionable insights.`
          },
          {
            role: 'user',
            content: `Analyze this developer's portfolio/GitHub profile and provide hiring insights:\n${portfolioContent}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'portfolio_analysis',
              description: 'Structured analysis of a developer portfolio',
              parameters: {
                type: 'object',
                properties: {
                  skill_level: {
                    type: 'string',
                    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
                    description: 'Overall technical skill level'
                  },
                  primary_languages: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Primary programming languages used'
                  },
                  technologies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key technologies and frameworks'
                  },
                  strengths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key strengths identified'
                  },
                  concerns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Potential concerns or red flags'
                  },
                  project_highlights: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Notable projects'
                  },
                  recommendation: {
                    type: 'string',
                    enum: ['strongly_recommend', 'recommend', 'consider', 'not_recommended'],
                    description: 'Hiring recommendation'
                  },
                  summary: {
                    type: 'string',
                    description: 'Brief summary of the candidate'
                  }
                },
                required: ['skill_level', 'primary_languages', 'technologies', 'strengths', 'recommendation', 'summary']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'portfolio_analysis' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    let analysis = null;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }
    }

    if (!analysis) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add GitHub stats to analysis
    if (githubData?.user) {
      analysis.github_stats = {
        username: githubData.user.login,
        public_repos: githubData.user.public_repos,
        followers: githubData.user.followers,
        profile_url: githubData.user.html_url
      };
    }

    analysis.analyzed_at = new Date().toISOString();

    // Update candidate with analysis
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        github_url: githubUrl || null,
        portfolio_url: portfolioUrl || null,
        portfolio_analysis: analysis
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Failed to update candidate:', updateError);
    }

    console.log('Portfolio analysis complete');
    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing portfolio:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
