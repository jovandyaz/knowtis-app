# Agent Module (Copilot)

Server-authoritative conversational copilot built on the AI Gateway. Runs a tool-use loop over the user's notes (and the web), proposes mutations behind human-in-the-loop (HITL) approval, persists conversation threads, and injects hybrid retrieval + long-term memory as context.

It follows the same DDD layering as the rest of `apps/api` (`domain/` → `application/` → `infrastructure/`) and talks to the frontend over a Socket.IO gateway. For end-to-end feature detail (memory A6a/A6b, hybrid retrieval, web search, BYOK, model selection) see [docs/AI.md](../../../../../docs/AI.md) — this README is the module map, not a duplicate of it.

## WebSocket protocol

`@WebSocketGateway` on the **`/agent`** namespace ([agent.gateway.ts](agent.gateway.ts)).

| Direction       | Event                                             | Meaning                                             |
| --------------- | ------------------------------------------------- | --------------------------------------------------- |
| client → server | `agent:message`                                   | New user turn (`{ conversationId?, message }`)      |
| client → server | `agent:approve` / `agent:reject` / `agent:cancel` | HITL decision on a pending proposal / cancel a turn |
| server → client | `agent:chunk`                                     | Streamed assistant text                             |
| server → client | `agent:proposal`                                  | A proposed mutation awaiting approval               |
| server → client | `agent:committed`                                 | Approved mutation applied                           |
| server → client | `agent:done`                                      | Turn finished (usage, sources, web sources)         |
| server → client | `agent:error`                                     | Auth / feature-flag / runtime error                 |

Also exposes a REST `MemoryController` ([memory.controller.ts](memory.controller.ts)) for listing/deleting long-term memories.

## Layer map

### `domain/`

Framework-free core: messages (`agent-message`, `coalesce-messages` for provider alternation), the turn transcript (`turn-transcript` builds a turn's rows on write, `prune-transcript` decides what the model replays on read, `message-tokens` prices the history), `proposed-mutation`, `retrieval`, `memory-reconcile`, `agent-event`, `agent-errors`. Ports under [`domain/ports/`](domain/ports):

| Port                        | Implemented by                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `agent-orchestrator.port`   | `infrastructure/orchestrator/ai-sdk-agent.orchestrator.ts`      |
| `conversation.repository`   | `infrastructure/persistence/drizzle-conversation.repository.ts` |
| `memory.repository`         | `infrastructure/persistence/drizzle-memory.repository.ts`       |
| `note-embedding.repository` | `infrastructure/retrieval/drizzle-note-embedding.repository.ts` |
| `pending-mutation.store`    | `infrastructure/pending/redis-pending-mutation.store.ts`        |
| `retrieval.port`            | `infrastructure/retrieval/feature-flagged-retrieval.adapter.ts` |

### `application/`

Thin command handlers (one `execute` each):

- `run-agent-turn.handler.ts` — orchestrates a turn: resolves the server-authoritative conversation, loads history + `knownNotes`, runs retrieval + memory, drives the orchestrator, and on a proposal saves it to the pending store before emitting `onProposal`.
- `approve-mutation.handler.ts` / `reject-mutation.handler.ts` — HITL resolution; approve applies the mutation and emits `agent:committed`.

### `infrastructure/`

| Subfolder       | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator/` | `ai-sdk-agent.orchestrator` (composes the turn, drives the fallback chain) running an **agent-owned step loop**, decomposed into: `agent-step-loop` (the policy loop — one `streamText` call per step, step-boundary failover), `step-call` (one independently budgeted call), `stream-health` (`agent.turn.health` per call), `turn-usage`, `turn-collectors`, `openrouter-options`, `message-mapper` (SDK↔domain parts, both directions); plus `agent-tool.registry`, `agent-system-prompt` + `compose-system-prompt`, `proposal-collector`, `mutation-proposal.builder`, `web-source.collector` |
| `tools/`        | Tool groups: `note-read`, `note-mutate`, `web` (each implements `AgentToolGroup`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `retrieval/`    | `keyword`, `hybrid` (FTS `ts_rank` + pgvector KNN + `rrf`), and `feature-flagged` adapters; `embedding-reconcile.task` cron; `note-hit.mapper`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `memory/`       | `memory-extraction.task` — Mem0-style long-term memory extraction cron                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pending/`      | `redis-pending-mutation.store` — HITL proposals survive across the approve round-trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `persistence/`  | Drizzle conversation + memory repositories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sanitize/`     | `html-sanitizer` for tool-generated note HTML                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Tools

Tools are grouped, not flat. Each group implements `AgentToolGroup` (`readonly name` + a `tools(ctx)` factory) and is composed by `AgentToolRegistry`:

- **`note-read`** — search / get notes (retrieval-backed).
- **`note-mutate`** — create / update notes → emit a **proposal** (never auto-applied; gated by HITL).
- **`web`** — `webSearch` / `webFetch` via the gateway's Tavily port (flag `agent_web_search`).

**Adding a tool group:** create `infrastructure/tools/<name>.tool-group.ts` implementing `AgentToolGroup`, then register it in the `AgentToolRegistry` providers in [agent.module.ts](agent.module.ts).

## HITL flow

```
agent:message → orchestrator runs tools → mutate tool emits proposal
  → pendingStore.save(...) (Redis, keyed by conversationId) → agent:proposal
  → user decides:
      agent:approve → ApproveMutationHandler applies it → agent:committed
      agent:reject  → RejectMutationHandler discards it
```

Because proposals live in Redis, approval works even across reconnects and is reconstructed from the server-side conversation, not client state.

## Eval harness

Opt-in, non-CI. Boots the real `AgentModule` via Vitest (requires `pnpm docker:up` for Postgres/Redis); some evals call real Voyage/Tavily.

```bash
nx run api:eval
```

Eval suites live in [`eval/`](eval): `copilot.eval`, `injection-guard.eval`, `memory-recall.eval`, `retrieval-quality.eval`, `transcript-replay.eval`, `web-search-quality.eval` (with `eval/fixtures/` note sets and an `eval/runtime/` bootstrap).

A run is only valid for the model it pinned. The transcript records `servedModel` from whichever terminal event reports usage, and `assertPinnedModelServed` rejects both a mismatch and a turn that ended without an error yet names no model — so nothing reaches the grader without proving which model served it. Only a failed turn may leave `servedModel` null; its error is surfaced instead.

The promptfoo suites (`copilot.eval`, `injection-guard.eval`) are multi-trial: `AI_EVAL_TRIALS` (default 1, nightly CI 3) repeats every case and a case fails below a 2/3 per-case pass rate — one flaky trial is tolerated, a consistent regression is not.
