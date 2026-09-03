# Agent Harness Review — Audit + Industry Benchmark

> Date: 2026-08-27
> `file:line` references taken on 2026-08-27; the code has changed since then (Bolt 1, Bolt 2/SP1, upgrade to AI SDK v7), so treat them as orientation, not as an exact anchor.
> Statuses last updated: 2026-09-03.
> Scope: Knowtis AI agent (`apps/api/src/modules/agent`, `apps/api/src/modules/ai`, `packages/ai-gateway`, `apps/mcp`) evaluated against the 6 pillars of an agent harness (Tool Registry, Model, Context Management, Guardrails, Agent Loop, Verify) and against 2025–2026 industry best practices.

## Executive summary

| Pillar             | Verdict                            | Core                                                                      |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| Agent Loop         | ✅ Well integrated                 | Custom multi-turn loop, multiple stop conditions, mid-turn failover       |
| Tool Registry      | ✅ Well integrated                 | Central DI registry, 100% Zod, phase+flag gating, HITL                    |
| Model              | ✅ Well integrated                 | DB + curated catalog, fail-closed BYOK, fallback chain + circuit breaker  |
| Guardrails         | ✅ Good (input) / ⚠️ weak (output) | 2-layer guard, fencing, AES-GCM encryption, multi-layer budgets           |
| Context Management | ⚠️ Partial                         | Fixed 12k window, no compaction, no check against the model's real window |
| Verify             | ⚠️ Partial                         | Strong HITL + nightly evals; zero semantic verification at runtime        |

This is not an LLM wrapper: a custom multi-step loop on top of the Vercel AI SDK, HITL for writes, a 2-layer injection guard, a db-backed model catalog, multi-layer rate limiting. The 3 strong pillars are above the industry average. The main divergences that remain against the 2025–2026 consensus: an in-loop budget denominated in USD (the token cap landed in Bolt 1; the consensus expresses it in cost — #365), a context budget derived from `maxInputTokens` (#366), and evals in CI. Transcript persistence stopped being a divergence: it shipped in Bolt 2 / SP1 and runs without a flag since #377.

### Progress (as of 2026-09-03)

| Delivery                             | PRs                          | What it closed                                                                                                                                                                                                                                                |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bolt 1 — loop hardening              | #336                         | `stopReason` in `agent:done`, per-turn token budget, persist-once on every terminal path, `agent.tool.error`, `releaseReservation` fix                                                                                                                        |
| Bolt 2 / SP1 — persistent transcript | #369, #371, #374, #375, #377 | `parts` (tool_use/tool_result) per step, `stop_reason`, `turn_id`, `pruneTranscript`; the flag was removed after validating it in prod                                                                                                                        |
| Protocol hygiene                     | #379                         | Removed the `committed` domain event, which was never emitted, and its dead plumbing (the `agent:committed` socket event is still alive)                                                                                                                      |
| Upgrade to AI SDK v7                 | #381                         | Closes #373 (per-model sampling filtering + `servedModel` guard in evals), migrates telemetry to `@ai-sdk/otel` + Langfuse v7 and corrects redaction by default                                                                                               |
| Eval pre-flight + BYOK catalog       | #387, #388, #389             | Pinned-model pre-flight and v7 usage-field debt, per-provider models scoped to BYOK with the curated August 2026 lineup, and the exfiltration eval fails on followable links rather than on safe mentions                                                     |
| Multi-trial evals + calibration      | #393, #394                   | `AI_EVAL_TRIALS` (nightly 3) with a per-case threshold of `ceil(2/3 × trials)`, `AI_EVAL_OUTPUT_DIR` + `eval-results` artifact, LLM-judge calibration tooling, with the eval model pinned to `anthropic:claude-sonnet-5` and the served-model guard from #387 |
| Model picker v2                      | #395, #396, #398, #399       | `ModelMenu` + submenus in the design system, `servesIntent` / `access` / `reasoning` in `GET /ai/models` with an intents-only anonymous listing, per-turn effort in the composer, and in the backoffice the assignable models per provider + key probes       |
| Eval denominator + effort            | #401, #402                   | Grader transport errors drop out of the denominator (a case that is 100% ungraded still fails), and effort reaches anthropic/openai/google natively in addition to openrouter via `turnProviderOptions` + `effortFor` per served model                        |

Two findings from the upgrade that count as harness lessons, not just changelog entries:

- **v7 inverted the telemetry default.** In v6 it was off; in v7 it turns itself on as soon as an integration is registered, with `recordInputs`/`recordOutputs` set to `true`. The wrappers omitted the field when nobody passed it — harmless before, a full export of prompt and response to Langfuse after. It affected note bodies and the conversation transcript + memories (the latter with the server key **after** a BYOK turn, bypassing the BYOK protection). Redaction is now the default in both providers and is pinned by mutation testing. Lesson for the Guardrails pillar: a dependency's default can shift the privacy posture without a single line of ours changing.
- **Upstream bug in `@openrouter/ai-sdk-provider@3.0.0`:** it does not declare `specificationVersion` on the provider object (its models do declare `'v4'`), so the SDK registry treats it as legacy and re-adapts models that are already v4 — `inputTokens` arrived at `ai_usage` as `"[object Object]"` and the cost came out `NaN`. The `asV4Provider` shim declares it and yields to upstream as soon as they publish theirs. Reported: [OpenRouterTeam/ai-sdk-provider#541](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/541).

---

## Part 1 — Repo audit

### 1.1 Agent Loop — ✅ well integrated

**Where it lives:**

| Layer                                                     | File                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Transport (WS Socket.IO, namespace `/agent`)              | `apps/api/src/modules/agent/agent.gateway.ts:54`                                                     |
| Turn orchestration (rate limit, model, BYOK, persistence) | `apps/api/src/modules/agent/application/run-agent-turn.handler.ts:442`                               |
| Port                                                      | `apps/api/src/modules/agent/domain/ports/agent-orchestrator.port.ts:26`                              |
| Adapter / fallback chain                                  | `apps/api/src/modules/agent/infrastructure/orchestrator/ai-sdk-agent.orchestrator.ts:50`             |
| Actual agentic loop                                       | `apps/api/src/modules/agent/infrastructure/orchestrator/agent-step-loop.ts:146` (`runAgentStepLoop`) |
| One call = one step                                       | `apps/api/src/modules/agent/infrastructure/orchestrator/step-call.ts:158` (`runStepCall`)            |

- Hand-rolled multi-turn tool use on top of the SDK: `stopWhen: isStepCount(1)` (`step-call.ts:213`; it was `stepCountIs` before the upgrade to v7) — the SDK does not run the loop; `while (completedSteps < input.maxSteps)` (`agent-step-loop.ts:178`) is our own loop. If `finishReason === 'tool-calls'` and steps remain, the `tool_use`/`tool_result` blocks are re-injected as history (`agent-step-loop.ts:338-355`).
- Tool execution is delegated to the SDK via `execute` callbacks; there is no manual dispatch.
- HITL: `propose*` tools do not mutate; they emit a proposal and cut the loop (`agent-step-loop.ts:320-337`), persisted in Redis with a TTL (`redis-pending-mutation.store.ts:51,78-79`). Resume runs with the mutation tools removed plus an anti-denial system note (`ai-sdk-agent.orchestrator.ts:35-36,113-151`).

**Stop conditions:** max steps (`AI_AGENT_MAX_STEPS`, default 8, `env.config.ts:60`), per-step retries (`MAX_STEP_ATTEMPTS = 2`), wall clock (`AI_AGENT_MAX_MS` 300s), 60s stall / 30s TTFT with a timer rearmed on each part (`step-call.ts:175-184`), abort on `agent:cancel` and on socket disconnect (`agent.gateway.ts:112-122,178-182,316-337`), concurrency (`AI_MAX_CONCURRENT_STREAMS` default 2), pre-turn rate limit.

**Errors in the loop:** discriminated union `COMPLETED | STALLED | INTERRUPTED | ERRORED` (`step-call.ts:128-152`), silent step retry, failover to another model mid-turn (non-BYOK only, `agent-step-loop.ts:75-87,234-263`) with reasoning pruning when the family changes, whole-turn fallback chain (`model-chain.ts:174-234`), per-provider circuit breaker (`provider-cooldown.tracker.ts`, `AI_COOLDOWN_ALLOWED_FAILS=3`).

**Streaming:** WebSocket (Socket.IO), not SSE. Events `agent:chunk`, `agent:thinking`, `agent:proposal`, `agent:committed`, `agent:done`, `agent:error`. Tool calls/results are NOT streamed to the client.

**Persistence:** tables `conversations` / `conversation_messages` (migration `0036`: `tool` role, versioned `parts` jsonb, `stop_reason`, `turn_id`); `persistTurn` writes one row per completed step plus the user message and the terminal assistant message, exactly once per turn and on every terminal path — `done`, `proposal`, `error`, `aborted` and closing without a terminal event (Bolt 1). Reads use `AI_AGENT_HISTORY_LIMIT` 120 (rows, not turns — a turn with tools writes 3-5) + `pruneTranscript` (verbatim replay of the last `AGENT_HISTORY_TOOL_TURNS`=2 turns with tools) + trimming by token budget (`AGENT_HISTORY_TOKEN_BUDGET`=12000, unchanged). The replay is **no longer gated**: the `agent_transcript_tools` flag was removed once validated in prod (#377), and the same goes for `stop_reason` and the `[reply cut off: <reason>]` marker for partial responses.

### 1.2 Tool Registry — ✅ well integrated

- `AgentToolGroup` contract (`infrastructure/tools/agent-tool.ts:20-25`): `{ name, flag?, availableIn(phase), build(ctx) }`, phases `full | readonly`.
- Central registry (`agent-tool.registry.ts:12-40`): filters by phase, skips when a flag is off, throws on name collision. Registered through multi-provider DI (`agent.module.ts:76-84`).
- 9 tools in 3 groups, all with Zod:
  - `note-read`: `searchNotes`, `getNote`, `listRecentNotes`, `getNotesOverview` (always)
  - `note-mutate`: `proposeCreateNote`, `proposeUpdateNote`, `proposeShareNote` (`full` phase only)
  - `web`: `webSearch`, `webFetch` (flag `agent_web_search`)
- Validation of the model's args is delegated to the AI SDK (schemas in `streamText({ tools })`).
- Bounded outputs: 20 search hits, 10k chars per note, 5 web hits × 1500 chars, 8k per fetch.
- Reads are scoped in SQL (`ownerId OR notePermissions`, `drizzle-note-read.repository.ts:334-342`), not through CASL. Writes: CASL re-checked at commit (`approve-mutation.handler.ts:95-106`), optimistic version against concurrent editing.
- No agent tool writes directly; a single proposal per run, with an atomic single-use Lua take in Redis.

### 1.3 Model — ✅ well integrated

- SDK: Vercel AI SDK (`ai@7`, `@ai-sdk/anthropic@4`, `@openrouter/ai-sdk-provider@3`; upgraded in #381). It does not use `@anthropic-ai/sdk` or the Claude Agent SDK.
- Chained resolution (`run-agent-turn.handler.ts:747-798`): request → conversation (HITL resume) → BYOK user preference → intent in DB (`ai_fast/default/deep_model`) → system default → first selectable. Final validation against the catalog (`AIModel.create`).
- Db-backed catalog (`ai_catalog_models`, `ai-catalog.schema.ts:37`): daily OpenRouter sync (`catalog-sync.task.ts:75`), LiteLLM prices with drift alerts, a 60s hot cache that never rejects, a code+DB merge where curated wins (`composite-model-catalog.ts:47-53`), promote/retire admin in the backoffice.
- Config in DB (`ai_config`): default/fast/deep model, fallback chain, reasoning effort, OpenRouter providers, free-tier ceiling. Code defaults as the floor.
- Per-user model selection (picker v2, #395–#399): `GET /ai/models` publishes `access`, `reasoning` and `servesIntent` per model, with the intent rows as the only anonymous view (everything that is not the default runs locked as an upsell); `offeredReasoning` (`selectable-models.service.ts`) trims the declared ladder down to what the user's tier can spend; the backoffice manages the assignable models per provider (`assignable-models.service.ts`) and probes the keys with `provider-probe.ts`.
- Per-turn effort (#402): the turn accepts `effort` in `agent:message` and `TurnEffortResolver` decides — `clampEffort` with `FREE_BOOST_CEILING = 'high'` for the free tier, the full ladder for BYOK, and rejection before creating a conversation for anonymous users (`run-agent-turn.handler.ts:175-178`); with no accepted `effort` it runs the global `ai_reasoning_effort` default, and only where the model declares the level. `turnProviderOptions` is the single seam that assembles `providerOptions`, shared with all structured output.
- BYOK: AES-256-GCM with a random IV (`secret-cipher.ts`), 32-byte `BYOK_ENCRYPTION_KEY` validated at startup, key validation with a real generateText, fail-closed if it cannot decrypt (`run-agent-turn.handler.ts:547-563`). BYOK turn: no fallback chain, no caching, no content in telemetry, skips the cost rate limit.
- Sampling: `temperature` hardcoded to 0.7 (`step-call.ts:43`), now harmless on the models that reject it — `@ai-sdk/anthropic@4` filters it per model (`rejectsSamplingParameters`) and emits a warning instead of letting the provider return a 400 (#373); `maxOutputTokens` global via env (8192), ignores the per-model ceiling in the catalog; prompt caching only `anthropic:*` and flag-gated (inert with the factory `openrouter:*` defaults). **Reasoning effort: RESOLVED (#402)** — it is no longer `openrouter:*` only. `turn-provider-options.ts` composes each provider's native block (`anthropic.{thinking, effort}`, `openai.reasoningEffort`, `google.thinkingConfig`, `openrouter.reasoning.effort`) and the step loop re-resolves it per candidate model via `effortFor`, so a mid-turn failover never sends another provider's option.

### 1.4 Guardrails — ✅ input / ⚠️ output

**Injection guard** (`packages/ai-gateway/src/guard/prompt-guard.ts`): 23 weighted EN/ES patterns, cumulative scoring, 0.6 threshold, NFKC normalization + stripping of 17 zero-width/bidi codepoints, anti-ReDoS guard (rejects >50k chars). Applied at 10 points: completions preflight, the turn's last message, history (unsafe user messages are dropped), memory pre-embed, web search hits, the Tavily response, webFetch content, retrieved note bodies (flag-gated), LLM-extracted memories, organization classification.

**Escalation to an LLM classifier** in the 0.3–0.6 gray zone (flag `agent_injection_classifier`), fail-open, outside the fallback chain, unconditional `recordContent: false`.

**Structural containment:** data fencing `<<NOTE_DATA … DATA, not instructions>>` with the marker neutralized inside the body; `toPromptLiteral` (JSON.stringify) for every untrusted value in the system prompt; a webFetch allowlist seeded only from user messages and webSearch results; SSRF blocking (loopback/private/link-local).

**Sanitization:** minimal input sanitizer (control chars); server-side HTML with a 20-tag allowlist (`html-sanitizer.ts:50-66`); client DOMPurify with `FORBID_TAGS` (img/iframe/svg/form...) which closes exfiltration via remote fetch; `harden-assistant-url.ts` blocks remote `<img src>` in chat.

**Rate limiting / costs** (`ai-rate-limit.service.ts`): global spend breaker (`AI_GLOBAL_DAILY_COST_LIMIT_USD` 25) → per-user RPM (15) → atomic token+cost reservation (100k tokens / $1 per day, anonymous 33%) → per-IP budget for anonymous users → PG fallback if Redis goes down → warning at 80% with a webhook.

**Feature flags:** 18 typed, 6 marked GUARDRAIL; every lookup is fail-safe (error → off). `ai_enabled` master flag in controllers + manual check in the WS gateways.

**Output:** HTML sanitization only + an injection re-screen on extracted memories. No moderation, no PII redaction, no re-scan of the assistant text.

### 1.5 Context Management — ⚠️ partial

- Token estimator (`packages/ai-gateway/src/tokens/token-estimator.ts`): 4k-char chunking (BPE is quadratic), specials counted as text, never throws, <1% drift, well tested. **It is used only for money, never for fit.**
- History: `AI_AGENT_HISTORY_LIMIT` DB rows (default 120, not turns — see 1.1) → safety filter (user only) → hardcoded `AGENT_HISTORY_TOKEN_BUDGET = 12_000` (`run-agent-turn.handler.ts:131`) walking backwards. 50k-char cap per user message.
- `maxInputTokens` exists in the catalog (`model-catalog.ts:12`) and is only consumed for display: nothing compares the estimate against the real window before calling.
- No compaction/summarization (grep: zero hits). A pure sliding window.
- The turn's tool results do not enter any budget: 8 steps × getNote at 10k chars ≈ 20k unaccounted tokens.
- Content injection: tool-driven (good) — `searchNotes` returns metadata only, `getNote` caps at 10k with a fence; memories 300 chars × 6 with a similarity floor; hybrid keyword+vector RRF is flag-gated.
- System prompts: agent = constant + runtime composition (`compose-system-prompt.ts`); completions = 17 `.md` files with frontmatter + partials (`content-is-data.md`).
- Exception: non-agent paths do a full dump (artifacts up to 48k chars).

### 1.6 Verify — ⚠️ partial

**Mutation chain (the strongest part):** Zod → sanitize with rejection if it comes out empty (`AgentErrors.sanitizeRejected`) → immutable domain VO with type guards → target existence verified in DB → mandatory HITL → CASL re-check + optimistic version at commit.

**Structured output:** `Output.object({ schema })` with Zod in voice-note, artifacts, organization, memory-reconcile.

**Tests:** 128 specs across agent/ai/ai-gateway. Injection corpus: 44 attacks + 35 benign (`injection-corpus.ts`). Evals (`modules/agent/eval/`, 6 suites): injection guard and copilot run in promptfoo with the `claude-haiku-4-5` grader; transcript replay shares the runtime's gate/model helpers; memory recall, retrieval quality and web search quality are pure vitest with their own boot; structural assertions (`assertGrounding` requires searchNotes→getNote order + sources).

**Eval CI:** nightly only (`.github/workflows/nightly-eval.yml`, cron 08:00, fails if the key is missing). It does NOT run on PRs.

**Observability:** Langfuse via OTel (`langfuse-tracing.service.ts`), telemetry redacted by default (`recordInputs/recordOutputs: false`); exhaustive tokens/costs through structured logs + a PG table (`AIUsageRepository`) + `AIMetricsService` for the backoffice; stream health per LLM call — one `agent.turn.health` line per `streamText`, including retries and failover, not one per turn (`emitTurnHealth`: DONE|EMPTY|STALL|TIMEOUT|ABORTED|ERROR|PROPOSAL|CONTINUED). No correlation between the Langfuse trace and the cost row (requestId does not travel in metadata).

**Missing:** semantic output verification (groundedness, cited URLs vs `webSources`), `editor-schema` does not validate proposed edits (the guarantee is a tag allowlist, not a valid ProseMirror document).

### 1.7 MCP — separate surface

- `apps/mcp` (Hono + `@modelcontextprotocol/sdk`): 8 kebab-case tools with MCP inputSchema+outputSchema+annotations, a single execution wrapper, no DB access (everything over HTTP to the API with the user's token), OAuth ES256 + `knowtis_mcp_*` API keys with token exchange.
- `apps/api/src/modules/mcp`: auth/keys only. The global `McpScopeGuard` validates the audience after signature verification and denies by default; endpoints with `@RequireMcpScope` + CASL → complete mediation OK.
- The internal agent does NOT consume MCP. Zero shared code: Zod schemas redeclared, two divergent Markdown→HTML pipelines, three copies of the scope map kept in sync by a "keep in sync" comment.
- Divergent policy: agent = HITL for everything; MCP = immediate `update-note`/`delete-note` (consent is handled by the MCP host per spec, but the irreversible `delete-note` has no internal HITL equivalent).

### 1.8 Audit gaps (prioritized)

1. **Multi-step history is not persisted** — resolved in Bolt 2 / SP1 (2026-08-30, live without a flag since #377): `conversation_messages` persists `parts` (complete tool_use/tool_result) per step and the replay always runs; so do `stop_reason` and the partial-response marker.
2. **An aborted/errored turn loses the user message** — resolved in Bolt 1: persist-once on every terminal path, including closing without a terminal event.
3. **Tool results have no budget inside the turn** — overflow is detected by the provider, not by the harness.
4. **`tool-error` is invisible** — resolved in Bolt 1: `agent.tool.error` + `toolCalls`/`toolErrors` counters in `agent.turn.health`; `repairToolCall` is still pending.
5. **Real bug** — resolved in Bolt 1: `suggest-organization.handler.ts` passed the raw IP where the signature expects a hashed `reservedIpSubject`, with no IP reservation in place → `correctUsage` against a nonexistent subject, negative Redis counters keyed by the cleartext IP.
6. **Output has no guardrails** — the assistant text in history is never re-scanned; poisoned text is persisted and replayed.
7. **Defense flags are off by default** — `agent_injection_classifier`, `agent_scan_retrieved_notes` (documented in `docs/AI.md`).
8. **Artifacts have no injection guard** — 48k chars of note go straight to the model (`generate-artifact.handler.ts`); same for `learn-topic.handler.ts`.
9. **Divergent agent↔MCP policy** — irreversible delete with no HITL equivalent; duplicated catalogs/schemas.
10. **Global `maxOutputTokens`** ignoring the per-model ceiling the catalog already persists. The `temperature` half stopped biting in #381: the provider filters it on the models that reject it, although the harness still sends a fixed 0.7 instead of deriving it per task.
11. **Exhausting `maxSteps` is silent** — resolved in Bolt 1: `done` carries `stopReason` (`completed` | `max_steps` | `length` | `token_budget` | `content_filter`) and every anomalous case leaves a warn.
12. **BYOK loses all resilience** — no fallback chain and no per-step failover.
13. **Evals are nightly-only** — single-trial **resolved (#393)**: `AI_EVAL_TRIALS` (nightly 3) judges each case by its pass rate with a `ceil(2/3 × trials)` threshold, and #401 drops from the denominator the trials whose only failure was a grader transport error, without letting a case that is 100% ungraded pass. Still open: the PR gate (nightly only) and the single injection E2E case. Since #381 they also no longer silently grade the wrong model: the transcript stores `servedModel` and the harness blows up if it differs from the pinned model (`anthropic:claude-sonnet-5` by default, overridable with `AI_EVAL_MODEL`; `assertPinnedModelServed` guard from #387).
14. **No trace↔cost correlation** in observability.
15. **No dead-letter** for failed usage reconciliation (the reservation hangs until the daily rollover).

---

## Part 2 — Industry benchmark (2025–2026)

Legend: **[CONSENSUS]** = multi-vendor/standard · **[VENDOR]** = a single vendor's position · **[PAPER]** = influential research.

### 2.1 Agent Loop

- **Stop conditions [CONSENSUS]**: always a double condition — natural termination (no tool calls / semantic signal) + a hard cap (turns and/or budget). Claude Agent SDK: native `maxTurns` + `maxBudgetUsd` ("Setting a budget is a good default for production agents"), with explicit `error_max_turns`/`error_max_budget_usd` subtypes. OpenAI: `max_turns` throws `MaxTurnsExceeded`. Vercel: first-class `stopWhen` with `stepCountIs` (the `Agent` class uses `stepCountIs(20)` by default; `streamText`/`generateText` use `stepCountIs(1)`), custom conditions on accumulated cost. Google ADK: `max_iterations` + semantic escalation, combine both.
- **Tool call persistence [unanimous CONSENSUS]**: persist complete `tool_use`/`tool_result` as the source of truth. OpenAI `result.to_input_list()` / Sessions; the Claude SDK keeps the full transcript and context editing trims server-side "while your client maintains the full unmodified history"; Vercel's `result.messages` includes tool calls/results. Pruning is a transformation at the edge (compaction, `prepareStep`, `input_filter`), never a loss of the record.
- **Streaming of tool events [CONSENSUS]**: events typed per phase. Vercel UI: state machine `input-streaming → input-available → output-available/output-error` (+ HITL states `approval-requested/responded`). Claude SDK: typed stream (`AssistantMessage`, `UserMessage` with tool results, `StreamEvent`, `ResultMessage` with usage/cost).
- **In-loop budgets**: Anthropic multi-agent research — "token usage explains 80% of the variance"; scale effort by complexity with explicit rules. The budget must live in a governance layer that cuts before the next call: an alert without enforcement does not stop a loop.

### 2.2 Tool design

- **Naming/schemas [CONSENSUS]**: namespacing per service/resource, unambiguous parameters, semantic identifiers, descriptions written as an onboarding doc, poka-yoke in arguments. Few high-impact tools; consolidate; overlap matters more than count (OpenAI: >15 well-defined ones are fine, <10 overlapping ones are bad).
- **Error handling [unanimous CONSENSUS]**: a tool error is just another tool_result that goes back to the model with actionable information ("specific and actionable improvements, not opaque error codes"); it is never swallowed and never breaks the loop. Google ADK: a dict with `status`, not exceptions.
- **Tool repair**: Vercel `experimental_repairToolCall` (re-generate args against the schema, or re-ask with the error) — the only first-class one.
- **Response bounding [CONSENSUS]**: pagination/ranges/truncation with sensible defaults; Claude Code truncates tool responses to 25k tokens by default (Anthropic, _Writing effective tools for agents_, Sep 2025); when truncating, include guidance toward more specific searches; `response_format: concise|detailed`.

### 2.3 Context Management

- **Compaction [CONSENSUS on direction]**: the Claude Agent SDK compacts automatically near the limit (`compact_boundary` event; persistent rules go in CLAUDE.md because compaction can lose them). Claude API: server-side primitives `clear_tool_uses_20250919` (100k trigger, keep the 3 most recent pairs) and `clear_thinking`. What to preserve: architecture decisions, unresolved bugs; discard redundant tool outputs.
- **"Context rot" [Anthropic]**: context = a finite resource with diminishing marginal returns; budget it deliberately. Dynamic budgets at runtime (Vercel's `prepareStep`, the Claude API's configurable triggers).
- **Just-in-time retrieval [CONSENSUS]**: lightweight identifiers + loading through tools at runtime, over pre-loading. Structured note-taking (external memory) as a complement.
- **Sub-agents to isolate context**: they explore with tens of thousands of tokens and return a 1-2k summary, so the orchestrator's context does not saturate with intermediate results (Anthropic, _How we built our multi-agent research system_, Jun 2025).

### 2.4 Model config

- **Routing [CONSENSUS]**: prototype with the most capable model to get a baseline, then downgrade wherever the evals allow. Guardrails run on small models; simple tasks on fast models.
- **Per-step sampling**: Vercel `prepareStep` — per-step override of temperature/maxOutputTokens/model/activeTools/toolChoice. Claude SDK: `effort` per session and per subagent.
- **Fallbacks**: explicit handling of refusals (`stop_reason`), resuming the session with higher limits as recovery, durable execution with checkpoints.

### 2.5 Security (OWASP + state of the art)

- **OWASP LLM01 (Prompt Injection)**: there is no foolproof prevention — everything is mitigation: constrain behavior, validate output with deterministic code, filters as one layer, least privilege, HITL for privileged actions, segregate/mark external content, adversarial testing.
- **Lethal trifecta [Willison, CONSENSUS]**: private data + untrusted content + external communication = exfiltration. The defense is architectural (remove one leg), not detection. "95% detection is a failing grade in web security."
- **Design patterns [multi-org PAPER, arXiv 2506.08837]**: once untrusted input has been ingested, the agent must be made incapable of triggering consequential actions. Patterns: Action-Selector, Plan-Then-Execute, Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization.
- **CaMeL [DeepMind, arXiv 2503.18813]**: control/data flow extracted from the trusted request; untrusted data never affects the flow; per-value capabilities. The most promising direction, with no mainstream implementation yet.
- **Spotlighting [Microsoft, arXiv 2403.14720]**: delimiting/datamarking/encoding of untrusted input; datamarking cut ASR from ~50% to <3%.
- **OWASP LLM05 (Output Handling)**: treat the model's output as user input (zero-trust); context-aware encoding; parameterized queries; CSP.
- **OWASP LLM06 (Excessive Agency)**: minimize tools and functionality; avoid open-ended tools; execute in the user's context with minimal scope; complete mediation (authorization at the resource, never trust the LLM); HITL for high impact; rate limiting as a damage limiter.
- **OWASP Agentic Top 10 (Dec 2025)**: ASI01 Goal Hijack, ASI02 Tool Misuse (denial-of-wallet), ASI03 Identity & Privilege Abuse, ASI06 Memory & Context Poisoning, ASI09 Human-Agent Trust Exploitation (decision fatigue in HITL — approvals must show the exact action).
- **MCP spec (2025-06-18)**: explicit per-tool consent in the host; tool descriptions = untrusted; RFC 8707 audience mandatory; token passthrough forbidden; sessions never as auth; scope minimization.
- **HITL [CONSENSUS]**: gates by default for irreversible deletes, external sends, shell/code, production, spend. Enforcement outside the model ("Permission rules are enforced by Claude Code, not by the model"). OpenAI: per-tool `needsApproval` with serializable state and resume; malformed JSON fails closed.
- **Output moderation**: structural output handling (LLM05) is always mandatory; semantic moderation (Llama Guard 4, OpenAI moderation) is mandatory when the output reaches third parties or regulated data is involved; optional in internal agents where action guardrails are prioritized. PII: Presidio as the OSS reference; masking (hygiene) vs blocking (compliance).
- **Cost controls [CONSENSUS]**: max_turns + a per-invocation timeout + a daily/per-session budget in tokens or USD, with hard enforcement versioned in git.

### 2.6 Verify + Evals

- **Verify as a stage of the loop [CONSENSUS, led by Anthropic]**: the canonical cycle "gather context → take action → verify work → repeat". Hierarchy: (1) deterministic rules (linters/tests/schemas — "the best form of feedback"), (2) visual feedback, (3) LLM-as-judge as a last resort.
- **Grader in a fresh context [Anthropic Cookbook "Outcomes"]**: self-verification suffers from self-verification bias (the agent rationalizes its own shortcuts); a stateless grader, rubric + artifact only, with evidence rubrics ("fetch the URL, look for the verbatim quote"); needs_revision → re-grade loop.
- **Runtime groundedness [CONSENSUS]**: baseline = offline eval + asynchronous monitoring over traces; inline guardrails only in high-risk flows (latency + over-triggering).
- **Dual CI [CONSENSUS]**: deterministic regression as a PR gate (paths-filtered, threshold <100%, response caching, cheap model) + the full suite nightly. Anthropic distinguishes capability evals (hill-climbing) from regression evals (~100%, every commit).
- **Multi-trial [CONSENSUS, originated at Anthropic]**: agentic behavior is stochastic — never a single trial. `pass@k` (one success is enough) vs `pass^k` (consistency required; 75% per trial → pass^3 ≈ 42%). Promptfoo: `repeat`/`repeat-min-pass`. State isolation between trials.
- **Graders**: code-based > model-based > human; "grade what the agent produced, not the path it took"; judges calibrated against humans, with an escape hatch, one per dimension; read transcripts regularly.
- **Observability**: the OTel GenAI semconv is in "Development" status for agents (spans `invoke_agent`/`execute_tool`, attributes `gen_ai.conversation.id`, `gen_ai.usage.*`; content is opt-in). Langfuse: a trace = one run, a session groups them, stable verb-first names, cost requires model+usage per generation, feedback as scores (never tags). Emerging standard metrics: steps/task, **tool error rate** (the #1 recommended alert), retry storms, cost per session/task.
- **Trajectory persistence [CONSENSUS]**: the full transcript with tool calls as first-class events (append-only), separate from state checkpointing for replay/fork (LangGraph checkpointers, AgentCore session replay).
- **Production→eval flywheel [strong CONSENSUS]**: explicit feedback (thumbs, typically <1% participation) + implicit feedback (retries, abandonment, regenerations) as scores → annotation queue → dataset → regression in CI. Anthropic: "convert user-reported failures into test cases"; start with 20–50 tasks from real failures.

### 2.7 Primary sources

**Vendors:** Anthropic [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) · [Agent loop docs](https://code.claude.com/docs/en/agent-sdk/agent-loop) · [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) · [Dynamic workflows](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) · [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [Outcome grader cookbook](https://platform.claude.com/cookbook/managed-agents-cma-verify-with-outcome-grader) · OpenAI [A practical guide to building agents (PDF)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) · [Agents SDK: running](https://openai.github.io/openai-agents-python/running_agents/) / [guardrails](https://openai.github.io/openai-agents-python/guardrails/) / [handoffs](https://openai.github.io/openai-agents-python/handoffs/) / [HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/) · Vercel AI SDK [loop control](https://ai-sdk.dev/docs/agents/loop-control) / [tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) / [chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) · Google ADK [LoopAgent](https://adk.dev/agents/workflow-agents/loop-agents/) / [function tools](https://adk.dev/tools-custom/function-tools/) · [Claude Code permissions](https://code.claude.com/docs/en/permissions) / [security](https://code.claude.com/docs/en/security)

**Security:** [OWASP LLM Top 10 2025](https://genai.owasp.org/llm-top-10/) (LLM01/02/05/06/08/10) · [OWASP Agentic Top 10 2026](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) · [Agentic Threats & Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) · Willison [Lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) / [Dual LLM](https://simonwillison.net/2023/Apr/25/dual-llm-pattern/) · [CaMeL (arXiv 2503.18813)](https://arxiv.org/abs/2503.18813) · [Design Patterns for Securing LLM Agents (arXiv 2506.08837)](https://arxiv.org/abs/2506.08837) · [Spotlighting (arXiv 2403.14720)](https://arxiv.org/abs/2403.14720) · [MSRC indirect PI defense](https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks) · [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) / [security best practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) · [Llama Guard 4](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard4/12B/MODEL_CARD.md)

**Evals/observability:** [Promptfoo CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/) · [Braintrust CI/CD 2025](https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025) / [hallucination tools 2026](https://www.braintrust.dev/articles/best-hallucination-detection-tools-2026) · [LangSmith trajectory evals](https://docs.langchain.com/langsmith/trajectory-evals) · [OTel GenAI agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) / [GenAI observability blog](https://opentelemetry.io/blog/2026/genai-observability/) · [Langfuse best practices](https://langfuse.com/docs/observability/best-practices) / [annotation queues](https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues) · [LangGraph checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)

---

## Part 3 — Cross-check: knowtis vs consensus

### 3.1 Where knowtis already meets (or exceeds) the consensus

| Consensus practice                                               | Source                                  | Knowtis                                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Double stop: natural + hard cap                                  | Anthropic, OpenAI, Vercel, ADK          | ✅ maxSteps + per-turn token budget (Bolt 1) + 300s + stall + TTFT + abort                                        |
| Injection contained architecturally                              | OWASP LLM01, Willison, arXiv 2506.08837 | ✅ fencing (≈spotlighting), egress allowlist (breaks the exfiltration leg), regex+classifier as a secondary layer |
| Just-in-time retrieval                                           | Anthropic                               | ✅ content through tools, 10k cap, never in the initial prompt                                                    |
| HITL with enforcement outside the model showing the exact action | OWASP LLM06, MCP spec, Claude Code      | ✅ propose→approve with a diff, CASL at commit, single-use Redis                                                  |
| Granular tools in the user's context                             | OWASP LLM06                             | ✅ 9 specific tools, SQL scoping                                                                                  |
| Complete mediation across every surface                          | OWASP LLM06 #7, RFC 8707                | ✅ MCP goes through controllers with CASL; audience validated                                                     |
| Tool errors go back to the model                                 | Unanimous consensus                     | ✅ Vercel SDK default                                                                                             |
| Response bounding                                                | Anthropic                               | ✅ caps on every tool                                                                                             |
| Structural telemetry (stall/retry/health)                        | Emerging                                | ✅ above average                                                                                                  |

### 3.2 Divergences confirmed by the industry

1. **Persist the full transcript with tool calls** — resolved in Bolt 2 / SP1 (2026-08-30): `parts` persists tool_use/tool_result per step and the verbatim replay runs without a flag since #377.
2. **An economic budget inside the loop** — first-class in 2026 (`maxBudgetUsd`); knowtis only gates pre-turn with an estimate.
3. **Exhausting max steps must be signaled** — SDKs throw an explicit error; knowtis emits a silent `done`.
4. **A dynamic context budget + compaction** — a fixed 12k budget decoupled from the `maxInputTokens` the catalog already has.
5. **Evals: dual CI + a multi-trial pass-rate threshold** — multi-trial resolved (#393, #401); the deterministic PR gate is still missing: knowtis runs nightly only.
6. **Verify with a fresh grader / asynchronous scoring** — knowtis has a deterministic layer but zero semantic or async verification.
7. **Tool events to the client** — the SDK they use ships it out of the box; they emit nothing.
8. **Per-step sampling** — `prepareStep` is available in their dependency; temperature is hardcoded.

### 3.3 New gaps uncovered by the research

- **No production→eval flywheel**: no capture of feedback as scores and no conversion of failures into eval cases.
- **`experimental_repairToolCall` unused.**
- **OTel GenAI semconv**: adopting `gen_ai.*` attributes + propagating `requestId` into telemetry would close the trace↔cost correlation.
- **Tool error rate**: the #1 metric/alert recommended by the industry; instrumented in Bolt 1 (`agent.tool.error` + `toolErrors` in `agent.turn.health`) and the alert has already shipped — a daily cron behind the `agent_health_alerts` flag (`infrastructure/health/agent-health-report.task.ts`) with thresholds `AGENT_TOOL_ERROR_ALERT_RATE` (0.10) and `AGENT_STOP_ANOMALY_ALERT_RATE` (0.20) to the alerts webhook.

### 3.4 Final prioritization

| #   | Action                                                                                                                                                                    | Effort     | Backing                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| 1   | Persist tool_use/tool_result (`conversation_messages` schema + roles) (resolved in Bolt 2 / SP1 — 2026-08-30; unconditional replay since #377)                            | Medium     | Unanimous consensus                                  |
| 2   | Instrument `tool-error` + a tool error rate metric (resolved in Bolt 1 — 2026-08-27; `repairToolCall` deferred)                                                           | Low        | Consensus + available primitive                      |
| 3   | Persist the user message on aborted/errored turns (resolved in Bolt 1 — 2026-08-27; tool call persistence remains in #1)                                                  | Low        | Derives from #1                                      |
| 4   | Cost/token stop condition in the loop + `max_steps` signal (resolved in Bolt 1 — 2026-08-27: `AI_AGENT_TURN_TOKEN_BUDGET` + `stopReason` in `done`)                       | Low-medium | Claude SDK, OWASP LLM10                              |
| 5   | Context budget derived from `maxInputTokens` + count tool results                                                                                                         | Medium     | Anthropic context engineering                        |
| 6   | Regression suite as a PR gate (paths-filtered) (multi-trial threshold resolved in #393/#401: `AI_EVAL_TRIALS` + `ceil(2/3 × trials)` threshold; only the PR gate remains) | Medium     | Promptfoo/Anthropic                                  |
| 7   | Fix the `releaseReservation` bug (raw IP) (resolved in Bolt 1 — 2026-08-27)                                                                                               | Trivial    | Our own audit                                        |
| 8   | Stream tool events to the client                                                                                                                                          | Low        | Vercel UI parts                                      |
| 9   | Feedback→dataset flywheel (Langfuse scores)                                                                                                                               | Medium     | Platform consensus                                   |
| 10  | History compaction/summarization                                                                                                                                          | High       | Anthropic; deferrable while conversations stay short |

Note on output moderation: per the consensus, it is optional for an internal agent whose output is not published — knowtis prioritizes action guardrails (correct). It becomes mandatory if generated notes are shared publicly.
