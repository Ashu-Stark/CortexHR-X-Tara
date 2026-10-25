// The resume-scoring prompts, shared by the parse-resume edge function and scripts/eval-scoring.ts so the
// evaluation always measures exactly what production sends. Moved verbatim from parse-resume/index.ts.

export interface PromptInput {
  truncatedResumeText: string;
  githubContent: string;
  hasGitHub: boolean;
  jobRequirements?: string | null;
}

export function buildScoringPrompts({ truncatedResumeText, githubContent, hasGitHub, jobRequirements }: PromptInput) {
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
${truncatedResumeText || 'No resume text available - score based on GitHub profile only.'}
${githubContent}

Analyze thoroughly and return ONLY valid JSON. Ensure the score is the exact sum of all breakdown points.`;

  return { systemPrompt, userPrompt };
}
