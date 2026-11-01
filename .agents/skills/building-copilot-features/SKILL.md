---
name: building-copilot-features
license: MIT
description: Guides changes to the Knowtis copilot and AI subsystem — the agent module, ai-gateway, HITL proposals, injection guard, fallback chain, BYOK, hybrid retrieval, long-term memory, and the promptfoo eval harness. Use when adding an agent tool group, touching anything under apps/api/src/modules/agent or packages/ai-gateway, changing model selection or provider config, working near BYOK or memory extraction, or when asked about the "copilot", "agente", "AI gateway", or copilot evals. Not for the single-shot ai module UI features or general repo orientation (use orienting).
---

# Building copilot features

The copilot is a **server-authoritative** conversational agent (`apps/api/src/modules/agent/`) on top of the framework-free `@knowtis/ai-gateway`. Safety invariants below are load-bearing — a change that violates one is a bug even if tests pass. Details: [references/safety-invariants.md](references/safety-invariants.md), [references/module-map.md](references/module-map.md), [references/eval-workflow.md](references/eval-workflow.md).

## Invariants you must never break

1. **Server-authoritative turns.** The client sends one message + `conversationId`; the server rebuilds history from Postgres. Never trust client-supplied history.
2. **HITL on every mutation.** Mutation tools emit a *proposal* parked in Redis; nothing is applied until `agent:approve` runs `ApproveMutationHandler`. No copilot code path may auto-apply. MCP tools are a separate surface: they apply directly under the client's OAuth consent or API-key scopes, enforced by `McpScopeGuard`.
3. **Everything retrieved is DATA.** Notes, memories, and web results are injected as data, never as instructions. `detectPromptInjection()` blocks at score ≥ 0.6; inputs > 50k chars are rejected (ReDoS defense). Every long-term-memory candidate fact passes the guard too, and a memory never authorizes an action: `isStorableMemory` refuses instructions and grants on notes, and only the user's current message can ask for a change.
4. **Fallback chain semantics.** Primary → the `ai_fallback_chain` `ai_config` row or the chain derived from the served intents, skipping keyless/cooldown providers. A stream never switches models mid-stream; aborts never advance the chain; the reported model is the one that actually served. BYOK turns skip the chain entirely and redact provider errors.
5. **BYOK encryption key is permanent.** Keys are AES-256-GCM under one unversioned `BYOK_ENCRYPTION_KEY`; replacing it makes stored credentials appear missing. There is no lossless rotation path today. If compromise forces rotation, rotate the key and require users to delete and re-enter provider keys. Preserving credentials would require a separately designed dual-key, versioned re-encryption migration. BYOK bypasses the daily budget but still enforces RPM.
6. **Key-gated features.** `ai_enabled` is the only DB feature flag; every other AI feature depends on its env var: no `VOYAGE_API_KEY` → retrieval reconcile cron no-ops; no `TAVILY_API_KEY` → the web tool group is not offered. "Feature not working" usually means `ai_enabled` or a missing key, not a bug.

## Standard workflows

- **New agent tool group**: create `infrastructure/tools/<name>.tool-group.ts` implementing `AgentToolGroup` (`readonly name` + `tools(ctx)` factory), register in `AgentToolRegistry` providers in `agent.module.ts`. Mutating tools MUST route through the proposal collector, never apply directly.
- **Model/provider changes**: gateway mode (`AI_GATEWAY_API_KEY` set → Vercel AI Gateway, slash-format ids) vs direct mode; callers always use colon-format ids. Model catalog = model index snapshot (`packages/ai-gateway/src/catalog`) ∩ provider listings; resolution cascade conversation → account → system default.
- **Retrieval changes**: hybrid = Postgres FTS `ts_rank` + pgvector KNN fused with RRF; embedding reconcile cron every 2 min behind advisory lock `778493001` (memory extraction uses `778493002`).
- **Any behavior change**: add or update a promptfoo eval before merging — see [references/eval-workflow.md](references/eval-workflow.md).

Canonical docs: `docs/AI.md` (the deep source of truth) and `apps/api/src/modules/agent/README.md`. Verify current behavior against those docs and the implementation.
