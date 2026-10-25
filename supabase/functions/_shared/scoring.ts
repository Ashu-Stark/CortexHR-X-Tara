// Pure helpers for turning an LLM's scoring reply into a safe, consistent analysis.
// No Deno or Node APIs here, so the edge function and the unit tests (node --test) both import this file.

export const CATEGORY_MAX = {
  technical_skills: 35,
  experience_quality: 25,
  education_certifications: 15,
  communication_presentation: 10,
  cultural_fit: 10,
  job_match: 5,
} as const;

export type Category = keyof typeof CATEGORY_MAX;
export const CATEGORIES = Object.keys(CATEGORY_MAX) as Category[];

/**
 * Extract the JSON object from an LLM reply. Handles ```json fences and text before/after the object
 * ("Here is the analysis: {...} Let me know..."), which made JSON.parse fail before.
 * Throws if no JSON object can be parsed.
 */
export function extractJson(text: string): Record<string, unknown> {
  if (!text || !text.trim()) throw new Error("No text to parse");
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object found in the AI reply");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/** A number from a number or numeric string ("30", " 12.5 "); anything else becomes 0. */
export function toPoints(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Clamp to [0, max] and round to a whole number: applications.ai_score is INTEGER with CHECK (0..100). */
export function clampPoints(value: unknown, max: number): number {
  return Math.round(Math.min(Math.max(toPoints(value), 0), max));
}

export interface NormalizeResult {
  analysis: Record<string, any>;
  corrections: string[]; // what had to be fixed, for the logs
}

/**
 * Make the score trustworthy regardless of what the model returned:
 * - every category's points become a number within its maximum (strings like "30" no longer concatenate),
 * - the overall score is ALWAYS the sum of the clamped categories (so it is within 0-100),
 * - a missing breakdown is an error, not a silent 0.
 */
export function normalizeAnalysis(raw: Record<string, any>): NormalizeResult {
  const corrections: string[] = [];
  const breakdown = raw?.score_breakdown;
  if (!breakdown || typeof breakdown !== "object") throw new Error("AI reply has no score_breakdown");

  const fixed: Record<string, any> = {};
  let total = 0;
  for (const cat of CATEGORIES) {
    const entry = breakdown[cat] ?? {};
    const original = entry.points;
    const points = clampPoints(original, CATEGORY_MAX[cat]);
    if (typeof original !== "number") corrections.push(`${cat}: points ${JSON.stringify(original)} -> ${points}`);
    else if (points !== original) corrections.push(`${cat}: ${original} clamped to ${points} (max ${CATEGORY_MAX[cat]})`);
    fixed[cat] = { ...entry, points };
    total += points;
  }
  if (toPoints(raw.score) !== total) corrections.push(`score ${JSON.stringify(raw.score)} -> ${total} (sum of categories)`);

  return { analysis: { ...raw, score: total, score_breakdown: fixed }, corrections };
}

/**
 * Analysis used when the AI reply cannot be used at all. Marked needs_manual_review with score null:
 * the old fallback gave a "neutral" 50, which ranked unparsed resumes above genuinely weak candidates.
 */
export function fallbackAnalysis(reason: string): Record<string, any> {
  const breakdown: Record<string, any> = {};
  for (const cat of CATEGORIES) breakdown[cat] = { points: 0, justification: "Not assessed - manual review needed" };
  return {
    score: null,
    needs_manual_review: true,
    score_breakdown: breakdown,
    score_justification: `The AI analysis could not be used (${reason}). No score is assigned; please review this resume manually.`,
    summary: `Automated scoring failed: ${reason}. Manual review required.`,
    skills: [],
    experience_years: 0,
    current_role: "Unknown",
    current_company: "Unknown",
    education_level: "Unknown",
    education_field: "Unknown",
    certifications: [],
    languages: [],
    strengths: [],
    concerns: ["Automated parsing incomplete"],
    red_flags: [],
    recommendations: ["Conduct manual resume review"],
    contact_info: { email: null, phone: null, location: null },
  };
}

/** Resume text sent to the model is capped so very long PDFs cannot blow the context window. */
export const MAX_RESUME_CHARS = 30000;

export function truncateResume(text: string | null | undefined, max = MAX_RESUME_CHARS): string {
  return text ? text.substring(0, max) : "";
}
