// The prompt tells the model each category's maximum; scoring.ts enforces its own maximums.
// If someone edits one and not the other, scores get silently clamped -- these tests catch that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoringPrompts } from "../supabase/functions/_shared/scoring-prompt.ts";
import { CATEGORY_MAX } from "../supabase/functions/_shared/scoring.ts";

const prompts = buildScoringPrompts({ truncatedResumeText: "RESUME-MARKER", githubContent: "", hasGitHub: false, jobRequirements: "JOB-MARKER" });

test("every category maximum in the prompt matches the code", () => {
  for (const [cat, max] of Object.entries(CATEGORY_MAX)) {
    const m = prompts.userPrompt.match(new RegExp(`"${cat}":\\s*\\{\\s*"points":\\s*<0-(\\d+)>`));
    assert.ok(m, `prompt has no points range for ${cat}`);
    assert.equal(Number(m[1]), max, `${cat}: prompt says 0-${m[1]}, code allows 0-${max}`);
  }
});

test("the category maximums add up to 100", () => {
  assert.equal(Object.values(CATEGORY_MAX).reduce((a, b) => a + b, 0), 100);
});

test("resume text and job requirements reach the prompt", () => {
  assert.match(prompts.userPrompt, /RESUME-MARKER/);
  assert.match(prompts.userPrompt, /JOB-MARKER/);
});

test("without GitHub data the prompt does not ask for a GitHub analysis", () => {
  assert.match(prompts.userPrompt, /"github_analysis": null/);
});
