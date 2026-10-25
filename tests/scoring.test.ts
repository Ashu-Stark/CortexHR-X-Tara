// Unit tests for supabase/functions/_shared/scoring.ts
// Run: node --test tests/      (Node 22.6+ runs TypeScript directly; no install needed)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_MAX,
  clampPoints,
  extractJson,
  fallbackAnalysis,
  MAX_RESUME_CHARS,
  normalizeAnalysis,
  toPoints,
  truncateResume,
} from "../supabase/functions/_shared/scoring.ts";

const breakdown = (p: Record<string, unknown>) => ({
  technical_skills: { points: p.t ?? 30, justification: "x" },
  experience_quality: { points: p.e ?? 20, justification: "x" },
  education_certifications: { points: p.ed ?? 12, justification: "x" },
  communication_presentation: { points: p.c ?? 8, justification: "x" },
  cultural_fit: { points: p.cf ?? 7, justification: "x" },
  job_match: { points: p.j ?? 4, justification: "x" },
});

// ------------------------------------------------------------------ extractJson
test("parses plain JSON", () => {
  assert.deepEqual(extractJson('{"score": 81}'), { score: 81 });
});

test("parses JSON inside ```json fences", () => {
  assert.deepEqual(extractJson('```json\n{"score": 81}\n```'), { score: 81 });
});

test("parses JSON with chatter before and after (this used to fall back to a fake score of 50)", () => {
  const reply = 'Here is the analysis you asked for:\n{"score": 72, "summary": "ok"}\nLet me know if you need more.';
  assert.equal(extractJson(reply).score, 72);
});

test("keeps nested braces intact", () => {
  const reply = 'Result: {"a": {"b": {"c": 1}}, "d": "{not a brace problem}"}';
  assert.equal((extractJson(reply) as { a: { b: { c: number } } }).a.b.c, 1);
});

test("empty or non-JSON replies throw (so the caller uses the fallback)", () => {
  assert.throws(() => extractJson(""), /No text/);
  assert.throws(() => extractJson("   "), /No text/);
  assert.throws(() => extractJson("Sorry, I cannot help with that."), /No JSON object/);
  assert.throws(() => extractJson('{"score": 7'), /No JSON object|JSON/);
});

// ------------------------------------------------------------------ points
test("toPoints accepts numbers and numeric strings, rejects the rest", () => {
  assert.equal(toPoints(12), 12);
  assert.equal(toPoints(" 30 "), 30);
  assert.equal(toPoints("thirty"), 0);
  assert.equal(toPoints(null), 0);
  assert.equal(toPoints(undefined), 0);
  assert.equal(toPoints(NaN), 0);
  assert.equal(toPoints(Infinity), 0);
});

test("clampPoints keeps points inside 0..max and makes them whole numbers", () => {
  assert.equal(clampPoints(50, 35), 35);
  assert.equal(clampPoints(-5, 35), 0);
  assert.equal(clampPoints(12.6, 15), 13);
  assert.equal(clampPoints("9", 10), 9);
});

// ------------------------------------------------------------------ normalizeAnalysis
test("a well-formed reply passes through unchanged", () => {
  const { analysis, corrections } = normalizeAnalysis({ score: 81, score_breakdown: breakdown({}) });
  assert.equal(analysis.score, 81);
  assert.deepEqual(corrections, []);
});

test("string points no longer concatenate into a nonsense score", () => {
  // old code: ("30" || 0) + ("20" || 0) + ... === "3020128 74" style string
  const raw = { score: "81", score_breakdown: breakdown({ t: "30", e: "20", ed: "12", c: "8", cf: "7", j: "4" }) };
  const { analysis } = normalizeAnalysis(raw);
  assert.equal(analysis.score, 81);
  assert.equal(typeof analysis.score, "number");
});

test("over-maximum categories are clamped, so the total can never exceed 100", () => {
  const raw = { score: 140, score_breakdown: breakdown({ t: 60, e: 40, ed: 20, c: 10, cf: 10, j: 5 }) };
  const { analysis, corrections } = normalizeAnalysis(raw);
  assert.equal(analysis.score_breakdown.technical_skills.points, CATEGORY_MAX.technical_skills);
  assert.equal(analysis.score, 100);
  assert.ok(corrections.some((c) => c.includes("clamped")));
});

test("the score is always the sum of the categories, even when the model's total is wrong", () => {
  const { analysis, corrections } = normalizeAnalysis({ score: 95, score_breakdown: breakdown({}) });
  assert.equal(analysis.score, 81);
  assert.ok(corrections.some((c) => c.startsWith("score")));
});

test("negative and missing points count as 0", () => {
  const b: Record<string, unknown> = breakdown({ t: -10 });
  delete b.job_match;
  const { analysis } = normalizeAnalysis({ score: 0, score_breakdown: b });
  assert.equal(analysis.score_breakdown.technical_skills.points, 0);
  assert.equal(analysis.score_breakdown.job_match.points, 0);
  assert.equal(analysis.score, 20 + 12 + 8 + 7);
});

test("the result always fits the database rule: integer between 0 and 100", () => {
  const cases = [
    breakdown({ t: 34.6, e: 24.5, ed: 14.4, c: 9.5, cf: 9.6, j: 4.9 }),
    breakdown({ t: 1e9, e: 1e9, ed: 1e9, c: 1e9, cf: 1e9, j: 1e9 }),
    breakdown({ t: -1e9 }),
  ];
  for (const b of cases) {
    const { analysis } = normalizeAnalysis({ score: 0, score_breakdown: b });
    assert.ok(Number.isInteger(analysis.score), `${analysis.score} is not an integer`);
    assert.ok(analysis.score >= 0 && analysis.score <= 100, `${analysis.score} out of range`);
  }
});

test("other fields of the analysis are kept", () => {
  const { analysis } = normalizeAnalysis({ score: 81, summary: "Strong backend profile", score_breakdown: breakdown({}) });
  assert.equal(analysis.summary, "Strong backend profile");
});

test("a reply without a breakdown is an error, not a silent zero", () => {
  assert.throws(() => normalizeAnalysis({ score: 77 }), /no score_breakdown/);
});

// ------------------------------------------------------------------ fallback + truncation
test("fallback marks the resume for manual review instead of inventing a score of 50", () => {
  const f = fallbackAnalysis("provider timeout");
  assert.equal(f.score, null);
  assert.equal(f.needs_manual_review, true);
  assert.match(f.score_justification, /provider timeout/);
  for (const v of Object.values(f.score_breakdown)) assert.equal(v.points, 0);
});

test("resume text is capped before it is sent to the model", () => {
  assert.equal(truncateResume("x".repeat(MAX_RESUME_CHARS + 500)).length, MAX_RESUME_CHARS);
  assert.equal(truncateResume("short"), "short");
  assert.equal(truncateResume(null), "");
  assert.equal(truncateResume(undefined), "");
});
