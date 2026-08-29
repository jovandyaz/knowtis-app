# Agent module map

Canonical source: `apps/api/src/modules/agent/README.md`.

## WebSocket protocol (`/agent` namespace)

| Direction | Event | Meaning |
| --- | --- | --- |
| client → server | `agent:message` | New user turn (`{ conversationId?, message }`) |
| client → server | `agent:approve` / `agent:reject` / `agent:cancel` | HITL decision / cancel turn |
| server → client | `agent:chunk` | Streamed assistant text |
| server → client | `agent:proposal` | Proposed mutation awaiting approval |
| server → client | `agent:committed` | Approved mutation applied |
| server → client | `agent:done` | Turn finished (usage, sources) |
| server → client | `agent:error` | Auth / flag / runtime error |

Plus a REST `MemoryController` for listing/deleting long-term memories.

## DDD layers

**domain/** — framework-free: `agent-message` (+ `coalesce-messages` for provider alternation), `proposed-mutation`, `retrieval`, `memory-reconcile`, `agent-event`, `agent-errors`. Ports:

| Port | Implementation |
| --- | --- |
| `agent-orchestrator.port` | `infrastructure/orchestrator/ai-sdk-agent.orchestrator.ts` |
| `conversation.repository` | `infrastructure/persistence/drizzle-conversation.repository.ts` |
| `memory.repository` | `infrastructure/persistence/drizzle-memory.repository.ts` |
| `note-embedding.repository` | `infrastructure/retrieval/drizzle-note-embedding.repository.ts` |
| `pending-mutation.store` | `infrastructure/pending/redis-pending-mutation.store.ts` |
| `retrieval.port` | `infrastructure/retrieval/feature-flagged-retrieval.adapter.ts` |

**application/** — one `execute` per handler: `run-agent-turn` (resolves server-authoritative conversation, loads history + knownNotes, retrieval + memory, drives orchestrator, parks proposals), `approve-mutation`, `reject-mutation`.

**infrastructure/** — `orchestrator/` (Vercel AI SDK tool loop, tool registry, system-prompt composer, proposal collector), `tools/` (groups: `note-read`, `note-mutate`, `web`), `retrieval/` (keyword, hybrid FTS+pgvector+RRF, feature-flagged adapter, reconcile cron), `memory/` (extraction cron), `pending/` (Redis store), `persistence/`, `sanitize/` (HTML sanitizer for tool-generated note HTML).

## Adding a tool group

1. `infrastructure/tools/<name>.tool-group.ts` implementing `AgentToolGroup` (`readonly name`, `tools(ctx)` factory).
2. Register in `AgentToolRegistry` providers in `agent.module.ts`.
3. Mutating tools emit proposals via the proposal collector — never apply directly.
4. Flag-gate if the group depends on an external key (pattern: `web` group behind `agent_web_search`).
