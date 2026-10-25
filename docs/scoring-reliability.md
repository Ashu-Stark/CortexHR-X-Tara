# Scoring reliability: tests, fixes and an evaluation

Branch `kriti/scoring-reliability`. Covers the resume-scoring path (`supabase/functions/parse-resume`).
**[Full write-up (PDF)](Scoring_Reliability_Kriti_Singhal.pdf)**

## Bugs found and fixed

All four were reproduced against the previous code before fixing:

| # | Problem | Before | After |
|---|---|---|---|
| 1 | Model returns points as strings (`"points": "30"`) | `(a || 0) + (b || 0)` concatenates: total became `"302012874"` | points converted to numbers first |
| 2 | Model gives a category more than its maximum (e.g. 60/35) | total 145; the update then fails the database rule `ai_score BETWEEN 0 AND 100` | each category clamped to its maximum; total always 0-100 |
| 3 | Model adds text around the JSON (`Here is the analysis: {...}`) | `JSON.parse` failed, candidate got a "neutral" **50** | JSON object extracted from the reply |
| 4 | Any unusable reply | fake score 50 ranked an unparsed resume above genuinely weak candidates | `score: null` + `needs_manual_review: true` (the UI already shows no score when it is null) |

Also: the total is always the sum of the categories and a whole number (the column is `INTEGER`), and the raw model
reply is no longer written to the logs (it contains candidate personal data).

## What changed

| File | Change |
|---|---|
| `supabase/functions/_shared/scoring.ts` | New: `extractJson`, `normalizeAnalysis`, `fallbackAnalysis`, `truncateResume` (pure functions, no Deno APIs) |
| `supabase/functions/_shared/scoring-prompt.ts` | New: the scoring prompts, moved **verbatim** out of `parse-resume/index.ts` (checked byte-for-byte against the old inline template) so the evaluation uses exactly the production prompt |
| `supabase/functions/parse-resume/index.ts` | Uses the two modules; about 190 lines shorter |
| `tests/*.test.ts` | 21 unit tests (Node's built-in test runner) |
| `scripts/eval-scoring.ts`, `scripts/eval-data.json` | Scoring evaluation |

## Run

```powershell
npm test                               # 21 tests, no install or API key needed (Node 22.6+)
$env:GROQ_API_KEY = "<your key>"       # never commit it
npm run eval:scoring                   # ~30 API calls, a few minutes on the free tier
```

## The evaluation

15 fictional resumes for 3 internship roles (backend, frontend, data), each labelled strong / medium / weak for its
role. Each resume is scored twice with the production prompt, model (`llama-3.3-70b-versatile`) and temperature (0).

- **Ranking:** for every pair of resumes for the same role with different labels, is the stronger one scored higher?
- **Consistency:** does the same resume get the same score twice?
- **Reliability:** how many replies needed corrections or went to manual review?

Results: _fill in from `scripts/eval-results.json` after running._

Limits: the resumes and labels were written by the same person, the set is small (24 comparable pairs), and the labels
are a judgement. It checks whether scoring is sensible and stable, not whether it is fair across groups of people,
which would need a much larger, carefully designed test.
