# Copilot Eval Harness Review — Audit vs Industry

> Date: 2026-08-31
> Scope: the copilot's eval harness (`apps/api/src/modules/agent/eval/`) evaluated as an _evaluation system_ against 2025–2026 industry practices. It complements `docs/agent-harness-review.md` (which audits the runtime harness); it does not repeat it.
> Method: exhaustive exploration of the current code (the spec `docs/superpowers/specs/2026-06-13-copilot-eval-harness-design.md` is out of date) + contrast with primary sources (see Sources).

## Actual state (vs the June spec)

| Aspect            | Spec 2026-06-13           | Today                                                                                                                                                 |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suites            | 1 (`copilot`)             | **6**: copilot (8 cases), injection-guard (1), transcript-replay (1), memory-recall (1), retrieval-quality (2), web-search-quality (1) — **14 cases** |
| Fixture sets      | 4                         | 7 (+`injection-es`, `benign-es`, `exfiltration`)                                                                                                      |
| CI                | excluded                  | Nightly cron 08:00 UTC (`.github/workflows/nightly-eval.yml`) with pgvector, migrations and fail-fast if `ANTHROPIC_API_KEY` is missing               |
| Transcript        | 5 fields                  | +`stopReason`, +`servedModel`, +`steps` (enables multi-turn replay)                                                                                   |
| Model guard       | did not exist             | `pinned-model.ts`: chain pre-flight + `servedModel` post-flight (#373/#381)                                                                           |
| Grader            | default                   | Explicit: `anthropic:messages:claude-haiku-4-5`                                                                                                       |
| Real dependencies | Anthropic + PG/Redis boot | +real Voyage (2 suites), +real Tavily (1 suite), seeds in real PG with cleanup                                                                        |

Architecture details: 2 suites use promptfoo as a library (`runEvalSuite` in `runtime/eval-runtime.ts`: copilot, injection-guard), 4 are pure Vitest. `maxConcurrency: 1` hardcoded. At the time of the audit: no repeat, no thresholds, no persisted output (see Status at the end — G1/G6/G8 closed afterwards). 72 unit tests cover the harness itself.

## Strengths (above average)

1. **Deterministic layer first, rubric second** (`assertions.ts`) — exactly the consensus: "code-based > model-based".
2. **Pinned `servedModel` guard** (`eval/pinned-model.ts`) — avoids grading the wrong model after a fallback; born from a real bug (#373).
3. **Anti-false-positive case** (`benign-es` guard-bait) — evaluating over-blocking is rare in the industry.
4. **`assertNoExfiltrationLink`** with HTML entity decoding and comparison by parsed hostname.
5. **Integration fidelity**: it boots the production DI graph with a minimal override (`RETRIEVAL_PORT`, `PENDING_MUTATION_STORE`) — eval↔prod drift is almost nil.
6. **Nightly with fail-fast** if the key is missing — no "green by silent skip".

## Prioritized gaps

### Tier 1 — consensus divergences with direct impact

**G1. Single-trial with a 100% requirement.** Each case runs 1× at the production temperature (fixed 0.7, `step-call.ts:43`) and `failures === 0` is required. Unanimous consensus (Anthropic; promptfoo `repeat` + pass-rate threshold): stochastic agentic behavior is never evaluated with a single trial. A red does not distinguish regression from variance (→ it gets ignored); a green can hide a regression that passed by luck. With 14 cases, running the rubric cases 3× costs cents. **The cheapest improvement with the highest return.** — **Resolved (#393, refined by #401)**: see Status.

**G2. Zero PR gate.** The repo's rule ("every prompt/tools change carries an eval before merge") has no enforcement: the evals run nightly, post-merge. Consensus: **dual CI** — a cheap deterministic subset on PRs, paths-filtered (`agent-system-prompt.ts`, `tools/`, `orchestrator/`) + the full suite nightly. The cases with purely `javascript` assertions + a cheap model (`AI_EVAL_MODEL`) would give a <2 min smoke gate.

**G3. No production→dataset flywheel.** The raw material exists and nothing consumes it:

- `conversation_messages` persists verbatim transcripts (`parts` tool_use/tool_result, `stop_reason`, `turn_id`, since #377)
- Guardrail logs (`ai.request.injection_blocked` with score, `agent.retrieval.content_blocked`, `agent.history.message_dropped`) — every real block is a candidate case (attack or false positive)
- `agent.turn.health` (outcome/toolErrors/stopReason per LLM call)

There is no user feedback (thumbs), no annotation queue, and no conversion of real failures into cases. The dataset is 100% synthetic/manual. This is the industry's strongest consensus (Hamel, LangSmith, Anthropic: _"convert user-reported failures into test cases"_; start with 20–50 tasks from real failures). `transcript-replay.fixtures.ts` already demonstrates the technical pattern.

**G4. Behavioral coverage with expensive holes.** 14 cases for the ~14 identified prompt-driven behaviors; the serious part is _what_ is missing:

| Surface with no eval                                                                                                                                                        | Severity |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **The entire resume phase** (the second half of HITL): pending store no-op ⇒ approve/reject → `resumeTurn`, `RESUME_SYSTEM_NOTE`, dropping proposals on resume — 0 coverage | High     |
| `proposeCreateNote` / `proposeShareNote` (only update has a case) + error paths (stale baseVersion, unverified email, sanitizeRejected)                                     | High     |
| Injection via note title, web snippet, or **stored memory** (persistent poisoning, OWASP ASI06); today only note-body EN/ES                                                 | High     |
| current-note / known-notes shortcuts (the composed prompt's anti-re-search mechanism)                                                                                       | Medium   |
| `webFetch`: egress allowlist, guard-driven drop — the web eval only covers `webSearch` with "there is ≥1 source"                                                            | Medium   |
| Single-shot `ai` module: 17 actions (artifacts, ghost-text, voice) with no quality evals — only unit tests with mocks                                                       | Medium   |
| Response language, "never claim delete", sharing-field semantics                                                                                                            | Low      |

### Tier 2 — methodological debt

**G5. Uncalibrated LLM-as-judge.** `llm-rubric` with haiku, never aligned against human labels. Established practice (Hamel): binary judgments + critique, calibrated against ~30 examples labeled by the expert, measuring precision/recall (not raw agreement). Today nobody knows whether the grader passes answers the team would fail. Lightweight version: label transcripts from 2-3 nightly runs and measure agreement. — **Resolved as tooling only (#394)**: `api:eval-judgments` + `api:eval-agreement` measure precision/recall against committed labels, neither gates CI; the human labeling step is still open.

**G6. No baselines and no historical tracking.** The only record: the GitHub Actions log. No JSON output, no artifacts, no comparison between runs — impossible to distinguish a gradual regression from the historical state, and impossible to do hill-climbing (capability evals vs regression evals, Anthropic's distinction). Promptfoo emits JSON/JUnit natively. — **Resolved (#393)**: `AI_EVAL_OUTPUT_DIR`, a 90-day `eval-results` artifact and a drift table vs the last successful nightly; coverage is still limited to the promptfoo suites (G7).

**G7. Fragmented architecture.** 2 promptfoo suites + 4 pure Vitest = two assertion/reporting models; the pure-vitest results do not make it into promptfoo's JSON (which limits G6's drift coverage to the promptfoo cases). Extracting the runtime into `packages/eval-runtime` had "2nd suite" as its trigger — there are 6 and it is still internal; `docs/AI.md` already describes `runtime/eval-runtime.ts` as the shared runtime instead of a pending "extraction target".

**G8. No online evals / asynchronous verification.** Baseline consensus: offline + asynchronous scoring over traces (groundedness, cited URLs ⊆ `webSources`). A real tension: Langfuse redacts content by default (the correct privacy decision post-#381), which blocks online semantic scoring. Content-free structural signals available today: a tool error rate alert (the alert shipped as item 7 — see Status), `stopReason` distribution drift (a rise in `max_steps`/`token_budget` = a loop-efficiency regression, still unimplemented).

### Tier 3 — hygiene

- **G9. `passWithNoTests: true`** (`vitest.eval.config.ts:14`): if the `src/**/*.eval.ts` glob breaks in a refactor, the nightly goes green with 0 tests.
- **G10. Manual red-teaming, not generative.** The guard's corpus (79 entries) covers the regex layer; behavioral E2E resistance is 4 manual cases. `promptfoo redteam` generates indirect injection / BOLA / tool misuse variants — useful as a quarterly run.
- **G11. `maxConcurrency: 1` hardcoded** — correct today (stateful singleton recording adapter); a bottleneck once the dataset grows.

## Recommended plan

| #   | Action                                                              | Effort      | Closes                |
| --- | ------------------------------------------------------------------- | ----------- | --------------------- |
| 1   | Repeat ×3 + a pass rate threshold on rubric cases                   | Low         | G1                    |
| 2   | Paths-filtered PR smoke gate (js-only cases, cheap model)           | Medium      | G2                    |
| 3   | New cases: resume phase + create/share proposals + poisoned memory  | Medium      | G4 (the serious part) |
| 4   | JSON output + artifact + comparison vs the previous run             | Low         | G6, enables G3        |
| 5   | Pipeline transcripts/guardrail-logs → candidate cases (flywheel v0) | Medium-high | G3                    |
| 6   | Lightweight judge calibration (label ~30, measure agreement)        | Low         | G5                    |
| 7   | Tool error rate alert + stopReason drift (structural online)        | Low         | G8                    |

Quick wins: 1, 4, 6, 7. Real work: 2, 3, 5.

**Observation**: `docs/agent-harness-review.md` had already identified G1/G2 (priority 6) and G3 (priority 9) back in August; the runtime harness was executed first (Bolt 1/2, SDK v7). With the runtime solid, the eval harness is today the weakest link in the system.

## Status (2026-09-03; the `feat/eval-harness-quick-wins` branch merged as #393/#394)

Items 1, 4 and 7 delivered; as-built semantics where they differ from what is proposed above:

- **Item 1 (G1, #393)**: `AI_EVAL_TRIALS` applies to _all_ promptfoo cases (a superset of "rubric cases"); a `ceil(2/3 × trials)` threshold per case. The `errors === 0` asserts were removed on purpose: a provider error in one trial is absorbed by the threshold (flake tolerance), while a systematic error (e.g. a key with no credits) fails 0/N and still turns the nightly red.
- **Threshold denominator (#401)**: a trial whose failures are all grader transport errors (`metadata.graderError`) carries no verdict and **drops out of the denominator** instead of counting as a regression. Two guards keep that from turning red into green: a case with _all_ of its trials ungraded fails, and a mixed trial — a behavioral failure **plus** a grader error — is still a failure, just like a provider throw (which is how `assertPinnedModelServed` blows up).
- **Eval model**: pinned to `anthropic:claude-sonnet-5` in the four suites that run an agent turn (`eval/copilot.eval.ts:20`, injection-guard, transcript-replay, web-search-quality), overridable with `AI_EVAL_MODEL`; the `assertPinnedModelServed` guard (#387) blows up if the served model differs.
- **Item 4 (G6)**: `AI_EVAL_OUTPUT_DIR` persists promptfoo's native JSON + `<suite>.summary.json` per promptfoo suite and `vitest.json` for the rest; an `eval-results` artifact (90 days) and a drift table vs the last successful nightly (it refuses to compare if the model or the trials change). The table covers only the promptfoo suites; full coverage arrives with G7.
- **Item 7 (G8)**: v0 with fixed thresholds (`AGENT_TOOL_ERROR_ALERT_RATE`, `AGENT_STOP_ANOMALY_ALERT_RATE`, n ≥ 20) over the persisted `conversation_messages` (error `outputType` parts and `stop_reason`), not over the `agent.turn.health` log; statistical drift with a moving baseline remains a follow-up if the fixed threshold turns out to be noisy.

Follow-ups noted in the branch review: dedup the shared block of the two promptfoo `*.eval.ts` files (together with G7) and remove the `minPassRate` knob, which has no production caller. QW6 (item 6, judge calibration) is already delivered: `api:eval-judgments` extracts the `llm-rubric` judgment worksheet from the native JSON and `api:eval-agreement` reports a confusion matrix, precision and recall over the labels committed in `calibration/labels/` — both are measurement only, neither gates CI. G5 remains open solely because of the human step: labeling ~30 rows over nightly transcripts.

## Sources

- Promptfoo: [assertions/expected-outputs](https://www.promptfoo.dev/docs/configuration/expected-outputs/) (deterministic, model-graded, `trajectory:*`), [CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/), [caching](https://www.promptfoo.dev/docs/configuration/caching/), [CLI/repeat/outputs](https://www.promptfoo.dev/docs/usage/command-line/), [red-team](https://www.promptfoo.dev/docs/red-team/)
- Hamel Husain: [Your AI Product Needs Evals](https://hamel.dev/blog/posts/evals/) (levels 1-3, error analysis, pass rate as a product decision), [Creating a LLM-as-a-Judge](https://hamel.dev/blog/posts/llm-judge/) (binary + critique, calibration with the expert, precision/recall)
- Anthropic: [develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) (critique-then-decide, volume over quality), Demystifying evals / Outcome grader cookbook (grader in a fresh context; capability vs regression evals)
- LangSmith: [evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts) (offline vs online, regression/exploration splits, annotation queues, flywheel)
- OWASP: [Agentic Top 10 2026](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) (ASI06 Memory & Context Poisoning)
