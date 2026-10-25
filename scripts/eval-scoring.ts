// Evaluates CortexHR's resume scoring with the SAME prompt (../supabase/functions/_shared/scoring-prompt.ts), model and
// post-processing (normalizeAnalysis) as production.
//
//   $env:GROQ_API_KEY = "..."      (PowerShell)    then    npm run eval:scoring
//   node scripts/eval-scoring.ts --runs 2 --delay 4000
//
// Questions it answers (scripts/eval-data.json: 3 jobs x 5 fictional resumes labelled strong/medium/weak):
//   1. Ranking:      for each job, pairs of resumes with different labels -> does the stronger one score higher?
//   2. Consistency:  each resume is scored --runs times -> how much does the score move between identical requests?
//   3. Reliability:  how many replies needed corrections or fell back to manual review?
// Results are printed and saved to scripts/eval-results.json. The API key is read from the environment only.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScoringPrompts } from "../supabase/functions/_shared/scoring-prompt.ts";
import { extractJson, normalizeAnalysis, truncateResume } from "../supabase/functions/_shared/scoring.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const RUNS = arg("runs", 2);
const DELAY_MS = arg("delay", 4000); // stay under free-tier rate limits
const KEY = (process.env.GROQ_API_KEY || "").split(",")[0].trim();
const MODEL = process.env.EVAL_MODEL || "llama-3.3-70b-versatile"; // same model and temperature as production
if (!KEY) {
  console.error("Set GROQ_API_KEY first (it is never stored or printed).");
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(here, "eval-data.json"), "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function complete(system: string, user: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") || 10) * 1000;
      console.log(`  rate limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const body = await res.json();
    return body.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("still rate limited after 5 attempts");
}

type Scored = { id: string; job: string; tier: number; scores: (number | null)[]; corrections: number; fallbacks: number };
const results: Scored[] = [];

for (const r of data.resumes) {
  const job = data.jobs.find((j: any) => j.id === r.job);
  const { systemPrompt, userPrompt } = buildScoringPrompts({
    truncatedResumeText: truncateResume(r.text),
    githubContent: "",
    hasGitHub: false,
    jobRequirements: `${job.title}: ${job.requirements}`,
  });
  const row: Scored = { id: r.id, job: r.job, tier: r.tier, scores: [], corrections: 0, fallbacks: 0 };
  for (let run = 0; run < RUNS; run++) {
    try {
      const { analysis, corrections } = normalizeAnalysis(extractJson(await complete(systemPrompt, userPrompt)));
      row.scores.push(analysis.score);
      if (corrections.length) row.corrections++;
    } catch (e: any) {
      row.scores.push(null);
      row.fallbacks++;
      console.log(`  ${r.id} run ${run + 1}: fallback (${e.message})`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`${r.id} (${r.job}, tier ${r.tier}): ${row.scores.join(", ")}`);
  results.push(row);
}

// ---- metrics
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const firstScore = (r: Scored) => r.scores.find((s) => s !== null) ?? null;

let pairs = 0, correct = 0, ties = 0;
for (const job of data.jobs) {
  const rs = results.filter((r) => r.job === job.id && firstScore(r) !== null);
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const [a, b] = [rs[i], rs[j]];
      if (a.tier === b.tier) continue;
      pairs++;
      const [hi, lo] = a.tier > b.tier ? [a, b] : [b, a];
      const d = firstScore(hi)! - firstScore(lo)!;
      if (d > 0) correct++;
      else if (d === 0) ties++;
    }
}

const repeatDiffs = results.flatMap((r) => {
  const s = r.scores.filter((x): x is number => x !== null);
  return s.length >= 2 ? [Math.max(...s) - Math.min(...s)] : [];
});
const byTier = [3, 2, 1].map((t) => ({ tier: t, mean_score: Math.round(mean(results.filter((r) => r.tier === t).map(firstScore).filter((x): x is number => x !== null)) * 10) / 10 }));
const calls = results.length * RUNS;

const summary = {
  model: MODEL,
  temperature: 0,
  resumes: results.length,
  runs_per_resume: RUNS,
  ranking: { pairs_with_different_labels: pairs, stronger_scored_higher: correct, ties, accuracy: pairs ? Math.round((correct / pairs) * 1000) / 1000 : null },
  mean_score_by_label: byTier,
  consistency: {
    resumes_with_identical_scores: repeatDiffs.filter((d) => d === 0).length,
    resumes_compared: repeatDiffs.length,
    mean_abs_change: Math.round(mean(repeatDiffs) * 10) / 10,
    max_change: repeatDiffs.length ? Math.max(...repeatDiffs) : null,
  },
  reliability: { calls, replies_needing_correction: results.reduce((a, r) => a + r.corrections, 0), fallbacks_to_manual_review: results.reduce((a, r) => a + r.fallbacks, 0) },
};

writeFileSync(join(here, "eval-results.json"), JSON.stringify({ summary, results }, null, 2));
console.log("\n" + JSON.stringify(summary, null, 2));
