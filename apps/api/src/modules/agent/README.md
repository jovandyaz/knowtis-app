# Agent Module (Copilot)

Server-authoritative conversational copilot built on the AI Gateway. Runs a tool-use loop over the user's notes (and the web), proposes mutations behind human-in-the-loop (HITL) approval, persists conversation threads, and injects hybrid retrieval + long-term memory as context.

It follows the same DDD layering as the rest of `apps/api` (`domain/` → `application/` → `infrastructure/`) and talks to the frontend over a Socket.IO gateway. For end-to-end feature detail (memory A6a/A6b, hybrid retrieval, web search, BYOK, model selection) see [docs/AI.md](../../../../../docs/AI.md) — this README is the module map, not a duplicate of it.

Per-turn reasoning **effort** is plumbed here but resolved elsewhere: a turn carries an `effort` off `agent:message`, the orchestrator port exposes `effortFor(model)` ([`domain/ports/agent-orchestrator.port.ts`](domain/ports/agent-orchestrator.port.ts)) and the step loop calls it per candidate model ([`infrastructure/orchestrator/agent-step-loop.ts`](infrastructure/orchestrator/agent-step-loop.ts)), so a step-boundary failover re-resolves for whichever model takes over. The audience clamp and the provider mapping live in the `ai` module (`TurnEffortResolver`, `turn-provider-options`) — see [Reasoning effort](../../../../../docs/AI.md#reasoning-effort).

## WebSocket protocol

`@WebSocketGateway` on the **`/agent`** namespace ([agent.gateway.ts](agent.gateway.ts)).

| Direction       | Event                            | Meaning                                                                                              |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| client → server | `agent:message`                  | New user turn (`{ conversationId?, message, noteId?, model?, effort? }`)                             |
| client → server | `agent:approve` / `agent:reject` | HITL decision on a pending proposal — `{ proposalId, noteId? }`, plus an optional `reason` on reject |
| client → server | `agent:cancel`                   | Abort the in-flight turn                                                                             |
| server → client | `agent:conversation`             | `{ conversationId }` — emitted once when the turn creates the conversation                           |
| server → client | `agent:chunk`                    | Streamed assistant text                                                                              |
| server → client | `agent:thinking`                 | Streamed reasoning summary (`{ text }`), rendered apart from the answer                              |
| server → client | `agent:proposal`                 | A proposed mutation awaiting approval                                                                |
| server → client | `agent:committed`                | Approved mutation applied (`{ proposalId, result }`)                                                 |
| server → client | `agent:done`                     | Turn finished: `{ usage, sources, knownNotes, webSources, stopReason, conversationId? }`             |
| server → client | `agent:error`                    | Auth / feature-flag / runtime error (`{ code, message }`; AI or `AGENT_*` codes, see below)          |

Connection-time checks mirror the `/ai` gateway: JWT from `auth.token` or the `Authorization: Bearer` header, `ai_enabled` flag, and a timer at the token's expiry that emits `agent:error` `AUTH_REQUIRED` and disconnects. Turns (fresh or resumed) run inside a `ConcurrencySlotTracker` slot capped at `AI_MAX_CONCURRENT_STREAMS` per user; an acquire past the cap emits `agent:error` `AI_RATE_LIMIT_EXCEEDED`.

Also exposes a REST `MemoryController` ([memory.controller.ts](memory.controller.ts)) for listing/deleting long-term memories — `JwtAuthGuard` only, no `ai_enabled` gate.

## Layer map

### `domain/`

Framework-free core: messages (`agent-message`, `coalesce-messages` for provider alternation), the turn transcript (`turn-transcript` builds a turn's rows on write, `prune-transcript` decides what the model replays on read, `message-tokens` prices the history), `proposed-mutation` (`MutationKind` = `create | update | share`), `retrieval`, `memory-reconcile`, `agent-event`, `agent-errors`. Ports under [`domain/ports/`](domain/ports):

| Port                        | Implemented by                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `agent-orchestrator.port`   | `infrastructure/orchestrator/ai-sdk-agent.orchestrator.ts`      |
| `conversation.repository`   | `infrastructure/persistence/drizzle-conversation.repository.ts` |
| `memory.repository`         | `infrastructure/persistence/drizzle-memory.repository.ts`       |
| `note-embedding.repository` | `infrastructure/retrieval/drizzle-note-embedding.repository.ts` |
| `pending-mutation.store`    | `infrastructure/pending/redis-pending-mutation.store.ts`        |
| `retrieval.port`            | `infrastructure/retrieval/feature-flagged-retrieval.adapter.ts` |

### `application/`

- `run-agent-turn.handler.ts` — orchestrates a turn: resolves the server-authoritative conversation, loads history + `knownNotes`, runs retrieval + memory, drives the orchestrator, and on a proposal saves it to the pending store before emitting `onProposal`. `resumeTurn` continues a turn after an approve or reject.
- `approve-mutation.handler.ts` / `reject-mutation.handler.ts` — HITL resolution; approve applies the mutation and emits `agent:committed`.
- `injection-guard.service.ts` — `guard(text, userId)`: heuristic `detectPromptInjection`, then the model classifier for gray-zone scores when `agent_injection_classifier` is on. Shared by the turn handler, the `webFetch` tool, and retrieved-note scanning.

### `infrastructure/`

| Subfolder       | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator/` | `ai-sdk-agent.orchestrator` (composes the turn, drives the fallback chain) running an **agent-owned step loop**, decomposed into: `agent-step-loop` (the policy loop — one `streamText` call per step, step-boundary failover), `step-call` (one independently budgeted call), `stream-health` (`agent.turn.health` per call), `turn-usage`, `turn-collectors`, `message-mapper` (SDK↔domain parts, both directions) — the per-provider `providerOptions` block comes from the shared `ai/infrastructure/providers/turn-provider-options`; plus `agent-tool.registry`, `agent-system-prompt` + `compose-system-prompt`, `proposal-collector`, `mutation-proposal.builder`, `web-source.collector`, `web-fetch-allowlist` (`WebFetchAllowlist`, the per-turn URL egress gate for `webFetch`) |
| `tools/`        | `agent-tool` (`AgentToolGroup` / `AgentToolContext`) and the groups `note-read`, `note-mutate`, `web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `retrieval/`    | `keyword`, `hybrid` (FTS `ts_rank` + pgvector KNN + `rrf`), and `feature-flagged` adapters; `embedding-reconcile.task` cron; `embedding-text` (`buildEmbeddingText`, `embeddingInputHash`); `note-hit.mapper`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `memory/`       | `memory-extraction.task` — Mem0-style long-term memory extraction cron                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pending/`      | `redis-pending-mutation.store` — HITL proposals survive across the approve round-trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `persistence/`  | Drizzle conversation + memory repositories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `health/`       | `agent-health-report.task` — daily cron behind flag `agent_health_alerts`, over `agent-health.queries` + `agent-health.evaluator`: tool-error and stop-anomaly rates, logged and webhook-alerted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sanitize/`     | `html-sanitizer` for tool-generated note HTML                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Tools

Tools are grouped, not flat. Each group implements `AgentToolGroup` (`readonly name` + a `tools(ctx)` factory) and is composed by `AgentToolRegistry`:

- **`note-read`** — `searchNotes`, `getNote`, `listRecentNotes`, `getNotesOverview` (retrieval-backed).
- **`note-mutate`** — `proposeCreateNote`, `proposeUpdateNote`, `proposeShareNote` → emit a **proposal** (never auto-applied; gated by HITL).
- **`web`** — `webSearch` / `webFetch` via the gateway's Tavily port (flag `agent_web_search`).

Per-tool descriptions: [Agent tools](../../../../../docs/AI.md#agent-tools).

**Adding a tool group:** create `infrastructure/tools/<name>.tool-group.ts` implementing `AgentToolGroup`, then register it in the `AgentToolRegistry` providers in [agent.module.ts](agent.module.ts).

## HITL flow

Proposals live in Redis keyed by `proposalId`; approve and reject both resume the turn with the outcome as the tool result, and `share` approvals are additionally gated by `VerifiedIdentityPolicy`. Full flow and payloads: [Human-in-the-loop](../../../../../docs/AI.md#human-in-the-loop).

## Error codes

`AgentErrors` ([`domain/agent-errors.ts`](domain/agent-errors.ts)): `AGENT_INVALID_PROPOSAL`, `AGENT_STALE_NOTE`, `AGENT_PROPOSAL_EXPIRED`, `AGENT_PERMISSION_DENIED`, `AGENT_EMAIL_NOT_VERIFIED` (`AGENT_EMAIL_NOT_VERIFIED_CODE` from `@knowtis/shared-types`), `AGENT_COMMIT_FAILED`, `AGENT_SANITIZE_REJECTED`, `AGENT_NOTE_NOT_FOUND`, `AGENT_TARGET_USER_NOT_FOUND`. Causes: [Agent error codes](../../../../../docs/AI.md#agent-error-codes). Everything else on `agent:error` is an `AIErrorCodes` member.

## Eval harness

Opt-in, non-CI. Boots the real `AgentModule` via Vitest (requires `pnpm docker:up` for Postgres/Redis); some evals call real Voyage/Tavily.

```bash
nx run api:eval
```

[`eval/`](eval) contents: the suites `copilot.eval`, `injection-guard.eval`, `memory-recall.eval`, `retrieval-quality.eval`, `transcript-replay.eval`, `web-search-quality.eval`; `agent-eval-harness` (boots the module graph), `cases` (promptfoo cases), `copilot-provider` (`createCopilotProvider`), `assertions`, `transcript` (`EvalTranscript`), `pinned-model` (`assertPinnedModelAvailable` / `assertPinnedModelServed`), `recording-fixture-retrieval`, `transcript-replay.fixtures`; `fixtures/` (note sets); `runtime/eval-runtime` (Promptfoo runner, trials, result output); `calibration/` (judge-calibration CLIs `judgment-extract.cli` / `agreement.cli` and their `labels/` directory).

A run is only valid for the model it pinned: `assertPinnedModelServed` rejects a `servedModel` mismatch and a non-error turn that names no model. Trials, ungraded-trial handling, nightly CI, and judge calibration: [Copilot Eval Harness](../../../../../docs/AI.md#copilot-eval-harness).
