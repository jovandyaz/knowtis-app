# Copilot safety invariants

Canonical source: `docs/AI.md` in the knowtis repo (the sections below summarize it; read it for full detail).

## HITL (human-in-the-loop)

```
agent:message → orchestrator runs tools → mutate tool emits proposal
  → pendingStore.save(...) (Redis, keyed by conversationId) → agent:proposal
  → agent:approve → ApproveMutationHandler applies → agent:committed
  → agent:reject  → discarded
```

- Proposals live in Redis, so approval survives reconnects and is reconstructed from server-side conversation state, not client state.
- MCP tokens cannot bypass HITL: proposals are the only mutation path from the agent.

## Injection guard

- `detectPromptInjection()` scores every retrieved/ingested text; ≥ 0.6 → `PROMPT_INJECTION_DETECTED` and the content is blocked.
- Inputs over 50k chars are rejected before scoring (ReDoS defense).
- Retrieved notes, memories, and web content are composed into the prompt as DATA blocks — never merged into system instructions.
- Long-term memory: every candidate fact extracted from conversations passes the guard before storage.

## Fallback chain and provider registry

- `ProviderRegistryFactory` runs in gateway mode (`AI_GATEWAY_API_KEY` → Vercel AI Gateway, slash-format model ids) or direct mode; callers always use colon-format ids.
- `FallbackChainService`: primary → `AI_FALLBACK_CHAIN`, skipping providers without keys or in cooldown (unless that leaves zero providers).
- Streams never switch model mid-stream. Aborted requests never advance the chain. The reported model is the one that actually served the request.
- `ProviderCooldownTracker` is a circuit breaker per provider.

## BYOK

- User keys encrypted AES-256-GCM under `BYOK_ENCRYPTION_KEY` (32-byte base64). **Never rotate this key once user keys are stored** — stored keys become undecryptable.
- BYOK turns: injected per-request, skip the fallback chain, redact provider error details, bypass the daily budget but keep RPM limits, and tag `ai_usage.byok` for billing attribution.
- Gated by the `agent_byok` DB flag.

## Retrieval and memory

- Hybrid retrieval (flag-gated): FTS `ts_rank` + pgvector KNN fused via Reciprocal Rank Fusion; requires `VOYAGE_API_KEY` (embedding reconcile cron no-ops without it). Advisory lock `778493001` serializes the reconcile cron.
- Long-term memory (A6b): userId-scoped, Mem0-style ADD/UPDATE/DELETE/NOOP reconcile; advisory lock `778493002`. Thread memory (A6a) is per-conversation.

## Rate limits and flags

- RPM and stream-concurrency limits are enforced in the gateway; BYOK does not lift them.
- Feature flags live in the DB (`PUT /api/v1/flags/:key`), default off. Env key missing → the flag must stay off (services no-op cleanly).
