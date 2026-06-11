# AI Module

## Overview

AI text assistant integrated into the Tiptap editor. Supports streaming responses over WebSocket and non-streaming over REST. Gated by the `ai_enabled` DB feature flag (managed via `feature_flags` table).

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Backend       | NestJS 11, Vercel AI SDK, Anthropic Claude          |
| Caching       | Redis (SHA-256 hash-keyed response cache)           |
| Rate Limiting | Redis (primary) + PostgreSQL (fallback)             |
| Persistence   | PostgreSQL 16, Drizzle ORM (`ai_usage` table)       |
| Frontend      | React 19, Tiptap 3, Zustand, Socket.io client       |
| Shared Types  | `@knowtis/shared-types` (actions, languages, tones) |

| Model                                 | Use case                              |
| ------------------------------------- | ------------------------------------- |
| `anthropic:claude-sonnet-4-20250514`  | All actions (default)                 |
| `anthropic:claude-haiku-4-5-20251001` | `ghost-text` only (latency-optimized) |

---

## Architecture

```
apps/api/src/modules/ai/
├── ai.controller.ts         # REST endpoints (complete, usage, metrics)
├── ai.gateway.ts            # WebSocket gateway (/ai namespace)
├── ai.module.ts
├── dto/                     # Request validation (class-validator)
├── domain/
│   ├── errors/              # AIErrors + AIErrorCodes
│   ├── ports/               # AICompletionProvider, AIStructuredOutputProvider, AICache, AIUsageRepository, RateLimitProvider, AIConfigRepository
│   └── value-objects/       # AIAction, AIModel, TokenUsage
├── application/
│   ├── commands/            # StreamTextHandler, CompleteTextHandler, VoiceNoteHandler
│   └── services/            # AIOrchestrator, AIRateLimitService, AIConfigService, VoiceTranscriptionService
├── infrastructure/
│   ├── alerting/            # WebhookAlertService (budget + cooldown alerts)
│   ├── catalog/             # ModelCatalogAdapter (LiteLLM-backed pricing, boot refresh)
│   ├── persistence/         # DrizzleAIUsageRepository, DrizzleAIConfigRepository
│   ├── providers/           # AISDKProvider, AIStructuredOutputSDKProvider, FallbackChainService, ProviderRegistryFactory
│   └── redis/               # AIRedisProvider, RedisRateLimitService, ExactMatchCacheService
└── testing/                 # createMockConfig, createTestCatalog, createTestChain helpers

packages/ai-gateway/         # @knowtis/ai-gateway — framework-free gateway core (zero workspace deps)
├── src/catalog/             # LiteLLMCatalog, computeTokenCostUsd, vendored pricing snapshot
├── src/chain/               # executeWithChain / streamWithChain, ProviderCooldownTracker
├── src/guard/               # prompt-guard (injection detection), input-sanitizer
├── src/tokens/              # token-estimator (gpt-tokenizer)
└── src/logger.ts            # GatewayLogger interface (no NestJS dependency)

apps/notes/src/components/editor/ai/
├── AIBubbleMenu.tsx           # Context menu on text selection
├── AIResultPanel.tsx          # Tippy-positioned panel below selection
├── AIStreamingPreview.tsx     # Streaming text display + accept/discard
├── SlashCommandMenu.tsx       # Slash command (/) dropdown
├── ai-actions.config.ts       # Bubble menu action definitions
└── slash-commands.config.ts   # Slash command definitions

apps/notes/src/components/editor/extensions/
├── ai-block/
│   ├── AIBlockNode.ts           # Custom Tiptap node (atom block, React node view)
│   ├── AIBlockView.tsx          # React component (input → stream → insert flow)
│   └── index.ts
├── GhostText.ts               # Tiptap extension for inline autocomplete
└── GhostText.css

apps/notes/src/stores/
└── ai.store.ts                # Zustand store (status, streamedText, selectionRange)

libs/api-client/src/lib/
└── ai.client.ts               # Socket.io client for /ai namespace

packages/shared/types/src/lib/
└── ai.types.ts                # AIAction, AILanguage, AITone constants + types
```

### Dependency Flow

```
AIGateway / AIController
  → StreamTextHandler / CompleteTextHandler
    → AIOrchestrator (model selection, prompt building)
    → AIRateLimitService (check + record)
    → AICompletionProvider port ← AISDKProvider
    → AICache port             ← ExactMatchCacheService
    → AIUsageRepository port   ← DrizzleAIUsageRepository
    → RateLimitProvider port   ← RedisRateLimitService
```

### Ports & Adapters

| DI Symbol                       | Interface                    | Implementation                  |
| ------------------------------- | ---------------------------- | ------------------------------- |
| `AI_COMPLETION_PROVIDER`        | `AICompletionProvider`       | `AISDKProvider`                 |
| `AI_STRUCTURED_OUTPUT_PROVIDER` | `AIStructuredOutputProvider` | `AIStructuredOutputSDKProvider` |
| `AI_USAGE_REPOSITORY`           | `AIUsageRepository`          | `DrizzleAIUsageRepository`      |
| `RATE_LIMIT_PROVIDER`           | `RateLimitProvider`          | `RedisRateLimitService`         |
| `AI_CACHE`                      | `AICache`                    | `ExactMatchCacheService`        |
| `AI_CONFIG_REPOSITORY`          | `AIConfigRepository`         | `DrizzleAIConfigRepository`     |
| `MODEL_CATALOG`                 | `ModelCatalog`               | `ModelCatalogAdapter`           |

---

## Actions, Languages, and Tones

All constants are defined in `packages/shared/types/src/lib/ai.types.ts` and shared between frontend and backend.

### Actions

| Action                | Model   | Cacheable | Description                               |
| --------------------- | ------- | --------- | ----------------------------------------- |
| `summarize`           | default | Yes       | Concise summary of content                |
| `expand`              | default | No        | Expand with more detail                   |
| `translate`           | default | Yes       | Translate to target language              |
| `tone`                | default | No        | Rewrite in requested tone                 |
| `outline`             | default | Yes       | Structured outline from content           |
| `action-items`        | default | Yes       | Extract checklist of action items         |
| `ghost-text`          | fast    | No        | Inline autocomplete at cursor             |
| `chat`                | default | No        | Q&A about note content                    |
| `improve-writing`     | default | No        | Improve clarity and readability           |
| `fix-spelling`        | default | No        | Fix spelling and grammar                  |
| `make-shorter`        | default | No        | Make text more concise                    |
| `make-longer`         | default | No        | Expand text with more detail              |
| `learn-topic`         | default | No        | Generate content about a topic (AI Block) |
| `generate-flashcards` | default | No        | Generate flashcard deck from note content |
| `generate-quiz`       | default | No        | Generate quiz from note content           |
| `generate-summary`    | default | No        | Generate structured summary from note     |
| `generate-mind-map`   | default | No        | Generate mind map from note content       |

**Model:** `default` = claude-sonnet, `fast` = claude-haiku. Configured via `FAST_MODEL_ACTIONS` in `ai-orchestrator.service.ts`.
**Note:** `generate-*` actions use the structured output port (Zod schema validation) via the artifacts module, not the streaming text pipeline.

### Languages

12 supported: English, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Chinese, Japanese, Korean, Arabic.

### Tones

8 supported: formal, casual, professional, friendly, academic, concise, creative, persuasive.

---

## Request Flow

### WebSocket Stream (primary)

```
User action (BubbleMenu / SlashCommand / GhostText)
  → aiClient.stream(payload)               # libs/api-client
  → Socket.io emit 'ai:complete'
  → AIGateway.handleComplete()
      JWT verified at connection time
      Zod validation of payload
  → StreamTextHandler.execute()
      AIAction.create()                     # validate action VO
      detectPromptInjection()               # content, selection, suffix
      estimateTokenCount()                  # rough token estimate
      AIRateLimitService.checkLimit()       # RPM (Redis) + daily tokens/cost
      AIOrchestrator.selectModel()          # haiku if ghost-text, sonnet otherwise
      ExactMatchCacheService.get()            # hash(action:model:prompt) lookup
        if hit → emit ai:chunk + ai:done → done
      AISDKProvider.streamCompletion()
      for each chunk → emit 'ai:chunk'
      await usage from provider
      AIRateLimitService.recordUsage()      # PG write + Redis correction
      ExactMatchCacheService.set()            # cache if cacheable action
      emit 'ai:done' { usage }
```

### REST Non-stream

```
POST /api/v1/ai/complete
  JwtAuthGuard + FeatureFlagGuard('ai_enabled')
  AICompleteDto validation (class-validator)
  → CompleteTextHandler.execute()
      same orchestration as above, returns full text
  → 200 { text, usage }
```

### Cancel

```
aiClient handle.cancel() OR emit 'ai:cancel'
  → AIGateway.handleCancel()
  → AbortController.abort()
  → StreamTextHandler exits for-await loop
```

---

## WebSocket Protocol

**Namespace:** `/ai`
**Authentication:** JWT sent via `socket.auth.token` at connection time. Invalid or missing token results in `ai:error` + disconnect.
**Feature gate:** If `ai_enabled` DB flag is disabled, server emits `ai:error` with `AI_FEATURE_DISABLED` and disconnects.

### Client → Server

| Event         | Payload                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `ai:complete` | `{ action, content, selection?, suffix?, targetLanguage?, targetTone? }` |
| `ai:cancel`   | _(no payload)_                                                           |

**Constraints:** `content` max 50,000 chars, `selection`/`suffix` max 10,000 chars. Validated with Zod on the server.

### Server → Client

| Event      | Payload                                                    |
| ---------- | ---------------------------------------------------------- |
| `ai:chunk` | `{ text: string }`                                         |
| `ai:done`  | `{ usage: { inputTokens, outputTokens, model, costUsd } }` |
| `ai:error` | `{ code: string, message: string }`                        |

### Error Codes

| Code                        | Cause                               |
| --------------------------- | ----------------------------------- |
| `AI_RATE_LIMIT_EXCEEDED`    | Daily token or cost limit reached   |
| `AI_FEATURE_DISABLED`       | `ai_enabled` flag is disabled       |
| `AUTH_REQUIRED`             | Missing or invalid JWT              |
| `VALIDATION_ERROR`          | Invalid action, content too long    |
| `AI_PROVIDER_ERROR`         | Upstream Anthropic API failure      |
| `AI_INVALID_MODEL`          | Model string not in supported list  |
| `AI_INVALID_ACTION`         | Action string not in supported list |
| `PROMPT_INJECTION_DETECTED` | Input flagged as prompt injection   |
| `AI_INTERNAL_ERROR`         | Unexpected server error             |

---

## Rate Limiting

Per-user daily limits enforced by `AIRateLimitService`.

**Strategy:** Redis-first (atomic, fast). Falls back to PostgreSQL aggregate query if Redis is unavailable.

**Limit check:** Before each request, the service checks estimated token count + current daily usage against `AI_DAILY_TOKEN_LIMIT` and `AI_DAILY_COST_LIMIT_USD`.

**Anonymous users:** receive a reduced fraction of the daily token/cost limits, configured via `AI_ANONYMOUS_DAILY_LIMIT_PCT` (default `0.33`). Anonymous identities are cheap to mint, so they warrant stricter quotas (OWASP LLM A04). The scaled limits are computed in `AIRateLimitService` and forwarded to both the Redis and PostgreSQL paths.

**Usage correction:** After the request completes, Redis counters are corrected with actual token counts (the pre-request check used an estimate).

**Daily reset:** Midnight UTC (`setUTCHours(0,0,0,0)`).

---

## Response Caching

`ExactMatchCacheService` caches responses using a SHA-256 hash of `userId:action:model:prompt` as the Redis key. The `userId` segment partitions the cache per user — identical prompts from different users never share a cached result (cross-user isolation). Within-user repeats still hit the cache.

**Cacheable actions:** `summarize`, `translate`, `outline`, `action-items`

**Not cached:** `ghost-text`, `chat`, `tone`, `expand`, `improve-writing`, `fix-spelling`, `make-shorter`, `make-longer`

Cache is bypassed on cancelled requests. TTL is configurable via `AI_CACHE_TTL_SECONDS` (default: 3600s).

---

## Prompt Injection Defense

`detectPromptInjection()` from `@knowtis/ai-gateway` (`packages/ai-gateway/src/guard/prompt-guard.ts`) checks all user input against known injection patterns (OWASP LLM01:2025) before processing.

**Detection categories:**

- Instruction override ("ignore previous instructions")
- Role hijacking ("you are now DAN")
- System prompt extraction ("output your system prompt")
- Delimiter injection (`</system>`, `[INST]`)
- Encoded payload detection (base64 with execute/decode commands)

**Behavior:** Requests scoring ≥ 0.6 are blocked with `PROMPT_INJECTION_DETECTED` error. Content, selection, and suffix fields are all checked. Inputs over 50,000 characters are rejected as a ReDoS defense.

**Logged as:** `ai.request.injection_blocked` with score and reason.

---

## RPM Rate Limiting

Per-user requests-per-minute limiting via Redis, enforced before daily token/cost limits.

**Strategy:** Fixed-window counter with 60s TTL per Redis key (`ai:ratelimit:{userId}:rpm:{minute}`). Atomic Lua script ensures no race conditions.

**Concurrent streams:** Maximum simultaneous AI streams per user, tracked via per-user numeric counter with unique stream IDs. Each `ai:complete` event generates a unique stream ID, preventing a single socket from bypassing the limit. Slots are released atomically via `try/finally` in the gateway.

| Variable                    | Default | Description                          |
| --------------------------- | ------- | ------------------------------------ |
| `AI_RPM_LIMIT`              | `15`    | Max requests per minute per user     |
| `AI_MAX_CONCURRENT_STREAMS` | `2`     | Max simultaneous AI streams per user |

---

## Dynamic Model Configuration

AI models can be changed at runtime via the `ai_config` database table, without redeployment.

**Priority:** DB value (cached 30s) → environment variable fallback.

**Supported keys:**

| Key                 | Env Fallback        | Description                |
| ------------------- | ------------------- | -------------------------- |
| `ai_default_model`  | `AI_DEFAULT_MODEL`  | Model for most actions     |
| `ai_fast_model`     | `AI_FAST_MODEL`     | Model for ghost-text       |
| `ai_fallback_model` | `AI_FALLBACK_MODEL` | Fallback on provider error |

**REST API:**

| Method | Path              | Description                                   |
| ------ | ----------------- | --------------------------------------------- |
| GET    | `/ai/config`      | Get all DB config values                      |
| PUT    | `/ai/config/:key` | Update a config value (allowlisted keys only) |

After updating a config value, the in-memory cache is invalidated and the new model takes effect within 30 seconds across all instances.

---

## Vercel AI Gateway

`ProviderRegistryFactory` (`apps/api/src/modules/ai/infrastructure/providers/provider-registry.factory.ts`) is the single place that resolves model ids to language models. It runs in one of two modes, selected at startup:

- **Gateway mode** — when `AI_GATEWAY_API_KEY` is set, all provider traffic routes through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Colon-format ids (`anthropic:claude-sonnet-4-20250514`) are translated internally to the gateway's slash format (`anthropic/claude-sonnet-4-20250514`). Direct provider keys (`ANTHROPIC_API_KEY`, etc.) are not required — the gateway holds provider credentials. Streaming, tool calling, and `providerOptions` pass through unchanged.
- **Direct mode** — when `AI_GATEWAY_API_KEY` is absent, the factory builds the direct-SDK registry (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`) exactly as before. This is the default for local development and the rollback path in production.

The rest of the system always uses colon-format model ids; the mode switch is invisible to callers. Malformed ids (missing the `provider:` prefix) throw `ProviderNotConfiguredError` in both modes.

Create a gateway key in the Vercel dashboard: **AI Gateway → API Keys**.

The app-side cross-provider fallback chain (below) stays active in both modes — it switches to a different _model_ on failure. The gateway adds _transport-level_ resilience (rerouting the same model across upstream providers) underneath it; the skip-providers-without-keys behavior only applies in direct mode.

---

## Cross-Provider Fallback Chain

`FallbackChainService` resolves the ordered candidates for every AI request: the primary model first, then the `AI_FALLBACK_CHAIN` (default `anthropic:claude-haiku-4-5-20251001 → openai:gpt-4o-mini → google:gemini-2.0-flash`), deduped. Providers without credentials or in cooldown are skipped — unless that would leave zero candidates, in which case the unfiltered list is used (a request is never failed without at least one attempt). The chain is validated against the model catalog at boot (fail-fast on unknown models).

Execution semantics (in `@knowtis/ai-gateway`'s `executeWithChain` / `streamWithChain`):

- A failed candidate advances to the next one; the error from the **last** candidate propagates.
- Streams never switch models after the first emitted chunk — a mid-stream failure propagates instead.
- Aborts (user cancel, timeout) never advance the chain.
- Usage, cost, and the `model` reported to clients always reflect the model that **actually served** the request.
- The copilot agent receives `isLast` per attempt so it can degrade gracefully only on the final candidate.

**Circuit breaker:** `ProviderCooldownTracker` puts a provider in cooldown after `AI_COOLDOWN_ALLOWED_FAILS` failures inside a 60s window (cooldown lasts `AI_COOLDOWN_SECONDS`). Cooling providers are skipped by the chain resolver; a success or expiry ends the cooldown. Events: `ai.provider.cooldown_start` / `ai.provider.cooldown_end`.

Model availability is an injected function, so a future per-user key source (BYOK) can plug in without touching the chain.

---

## Model Catalog & Pricing

Pricing and context-window data come from [LiteLLM's public pricing JSON](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) via `LiteLLMCatalog` (`@knowtis/ai-gateway`):

- A vendored snapshot (`model-prices.snapshot.ts`, regenerated with `node tools/refresh-model-catalog.mjs`) ships with the package so the catalog works offline.
- With `AI_PRICING_REFRESH_ENABLED=true`, `ModelCatalogAdapter` refreshes from the live JSON at boot (10s timeout, fail-soft to the snapshot).
- `computeTokenCostUsd` prices each request from the served model's rates, including Anthropic cache read/write token rates. Voice transcription is priced per second of audio (`input_cost_per_second`, mode `audio_transcription`) using the real duration reported by the provider.
- Unknown models record `costUsd = 0` and log `ai.pricing.unknown_model` once per model.

---

## Health & Alerting

**`GET /api/v1/ai/health`** (admin-only, same guards as `GET /ai/config`) returns a passive per-provider snapshot from the cooldown tracker — `{configured, cooling, failureCount, lastFailureAt, lastSuccessAt, cooldownEndsAt}`. No probes are sent and no tokens are spent.

**Budget warning:** when a user's daily usage crosses 80% of the token or USD budget, `ai.budget.warning` is logged once per user per day (Redis `SET NX` flag with 25h TTL; per-instance in-memory fallback when Redis is down).

**Webhook:** if `AI_ALERT_WEBHOOK_URL` is set, `budget.warning` and `cooldown_start` events POST a JSON payload to it — fire-and-forget with a 5s timeout; failures are logged and never block the request.

---

## Telemetry (Langfuse)

All four AI paths emit OpenTelemetry spans consumed by Langfuse (see `modules/observability`): the copilot agent (`agent-turn`), completions (`completion:<action>`), structured artifacts (`artifact:<action>`), and voice cost records. Spans carry `{userId, environment}` metadata. Telemetry is a no-op when Langfuse keys are not configured.

---

## Anthropic Prompt Caching

System prompts are automatically cached by Anthropic using `cacheControl: { type: 'ephemeral' }` via Vercel AI SDK `providerOptions`. This is applied only for Anthropic models (prefix `anthropic:`).

**Benefits:**

- 90% reduction on input token costs for cache hits (0.1× base price)
- Up to 85% latency reduction on repeated system prompts
- 5-minute cache TTL (Anthropic default for ephemeral)

Non-Anthropic models receive the system prompt as a plain string (no caching metadata).

---

## Environment Variables

All AI variables go in `apps/api/.env`. Feature toggles (`ai_enabled`, `voice_notes_enabled`) are managed via the `feature_flags` DB table, not environment variables.

| Variable                       | Required | Default                                | Description                                             |
| ------------------------------ | -------- | -------------------------------------- | ------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`           | No       | —                                      | Vercel AI Gateway key; enables gateway mode when set    |
| `ANTHROPIC_API_KEY`            | No       | —                                      | Anthropic API key (validated at runtime)                |
| `OPENAI_API_KEY`               | No       | —                                      | OpenAI API key (chain fallback + Whisper transcription) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No       | —                                      | Google AI Studio key (chain fallback)                   |
| `AI_DEFAULT_MODEL`             | No       | `anthropic:claude-sonnet-4-20250514`   | Model for most actions                                  |
| `AI_FAST_MODEL`                | No       | `anthropic:claude-haiku-4-5-20251001`  | Model for `ghost-text`                                  |
| `AI_FALLBACK_CHAIN`            | No       | haiku → gpt-4o-mini → gemini-2.0-flash | Cross-provider fallback chain, comma-separated          |
| `AI_COOLDOWN_ALLOWED_FAILS`    | No       | `3`                                    | Failures per minute that start a provider cooldown      |
| `AI_COOLDOWN_SECONDS`          | No       | `120`                                  | Provider cooldown duration (seconds)                    |
| `AI_TRANSCRIPTION_MODEL`       | No       | `openai:whisper-1`                     | Voice transcription model (only `openai:` supported)    |
| `AI_PRICING_REFRESH_ENABLED`   | No       | `false`                                | Refresh model pricing from LiteLLM's JSON at boot       |
| `AI_ALERT_WEBHOOK_URL`         | No       | —                                      | Webhook for `budget.warning` / `cooldown_start` alerts  |
| `AI_DAILY_TOKEN_LIMIT`         | No       | `100000`                               | Per-user daily token cap                                |
| `AI_DAILY_COST_LIMIT_USD`      | No       | `1.0`                                  | Per-user daily cost cap (USD)                           |
| `AI_ANONYMOUS_DAILY_LIMIT_PCT` | No       | `0.33`                                 | Fraction of daily limits for anonymous users            |
| `AI_MAX_RETRIES`               | No       | `3`                                    | Provider retry count                                    |
| `AI_TIMEOUT_MS`                | No       | `30000`                                | Total request timeout (ms) — REST completions only      |
| `AI_STREAM_MAX_MS`             | No       | `180000`                               | Total streaming cap (ms); generous for long generations |
| `AI_STREAM_CHUNK_TIMEOUT_MS`   | No       | `10000`                                | Per-chunk (stall) timeout for streaming (ms)            |
| `AI_CACHE_ENABLED`             | No       | `true`                                 | Enable response cache                                   |
| `AI_CACHE_TTL_SECONDS`         | No       | `3600`                                 | Cache TTL (seconds)                                     |
| `AI_RPM_LIMIT`                 | No       | `15`                                   | Max requests per minute per user                        |
| `AI_MAX_CONCURRENT_STREAMS`    | No       | `2`                                    | Max simultaneous AI streams per user                    |

### Feature Flags (DB-backed)

| Flag Key              | Description                |
| --------------------- | -------------------------- |
| `ai_enabled`          | Global AI feature gate     |
| `voice_notes_enabled` | Voice-to-note feature gate |

Managed via `PUT /api/v1/flags/:key` (admin only). Cached in Redis (30s TTL).

---

## Database Schema

Two tables: `ai_usage` and `ai_config`.

| Column          | Type              | Notes                         |
| --------------- | ----------------- | ----------------------------- |
| `id`            | uuid (PK)         | Auto-generated                |
| `user_id`       | uuid (FK → users) | CASCADE on delete             |
| `action`        | varchar(50)       | AI action name                |
| `model`         | varchar(80)       | Model identifier              |
| `input_tokens`  | integer           | Tokens sent to provider       |
| `output_tokens` | integer           | Tokens received from provider |
| `cost_usd`      | numeric(10,6)     | Estimated cost                |
| `created_at`    | timestamptz       | Auto-set                      |

Indexed on `(user_id, created_at)` for efficient daily aggregation queries.

### `ai_config`

| Column        | Type            | Notes                 |
| ------------- | --------------- | --------------------- |
| `key`         | varchar(100) PK | Config key identifier |
| `value`       | varchar(500)    | Config value          |
| `description` | varchar(500)    | Human-readable label  |
| `updated_at`  | timestamptz     | Auto-set on upsert    |

Used by `AIConfigService` for dynamic model configuration (see [Dynamic Model Configuration](#dynamic-model-configuration)).

> After schema changes, run `pnpm db:push`.

---

## Frontend Integration

### Editor Components

| Component            | Behavior                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| `AIBubbleMenu`       | Appears on text selection. 8 actions, sub-menus for translate and tone.                 |
| `SlashCommandMenu`   | Triggered by `/`. Shows AI commands + formatting commands.                              |
| `AIResultPanel`      | Tippy panel below selection. Replace, insert below, or discard result.                  |
| `AIStreamingPreview` | Streams text as chunks arrive. Shows retry button on error.                             |
| `GhostText`          | Tiptap extension. Inline suggestion after inactivity. Tab to accept, Escape to dismiss. |
| `AIBlockNode`        | Tiptap atom node. Inline topic-based content generator with streaming preview.          |

### Zustand Store (`useAIStore`)

| State            | Type                                         | Description                     |
| ---------------- | -------------------------------------------- | ------------------------------- |
| `status`         | `'idle' \| 'streaming' \| 'done' \| 'error'` | Current AI stream state         |
| `streamedText`   | `string`                                     | Accumulated response            |
| `error`          | `AIErrorPayload \| null`                     | Error from server               |
| `selectionRange` | `{ from, to } \| null`                       | Editor selection at action time |
| `lastPayload`    | `AICompletePayload \| null`                  | Used for retry                  |

Key actions: `startStream(payload)`, `cancelStream()`, `retry()`, `reset()`, `setSelectionRange(range)`.

### API Client (`aiClient`)

Singleton exported from `@knowtis/api-client`. Connects lazily on first `stream()` call.

```typescript
import { aiClient } from '@knowtis/api-client';

const handle = aiClient.stream(
  { action: 'summarize', content: '...' },
  {
    onChunk: ({ text }) => {
      /* accumulate */
    },
    onDone: ({ usage }) => {
      /* finished */
    },
    onError: ({ code, message }) => {
      /* handle */
    },
  }
);

// Cancel:
handle.cancel();
```

Token provider must be configured (done in `apps/notes/src/auth/setup.ts`):

```typescript
aiClient.setTokenProvider({ getAccessToken, clearTokens });
```

### GhostText Behavior

- Triggers after 1500ms of inactivity (debounced, configurable via `debounceMs`)
- Requires minimum 20 characters of content before cursor
- Suppressed if another AI action is active (`isAIBusy` check)
- Cursor move or selection change clears suggestion and cancels in-flight stream
- **Tab** accepts, **Escape** dismisses

### AI Block

Custom Tiptap node extension (`aiBlock`) that renders an inline AI content generator inside the editor. Users type a topic, and the block streams a `learn-topic` response directly into the document.

**Lifecycle:** `input` → `streaming` → `done` / `error`

| Status      | Behavior                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `input`     | Text input + generate button. Escape deletes the block.                  |
| `streaming` | Streams chunks via `aiClient.stream()`. Cancel returns to `input`.       |
| `done`      | Rendered markdown. Insert (replaces block with HTML), retry, or discard. |
| `error`     | Error message with retry and discard buttons.                            |

Inserted via slash command. The block is an atom node (non-editable content), rendered with `ReactNodeViewRenderer`. Markdown is converted to sanitized HTML via `markdown-it` + `DOMPurify` before insertion.

**Source:** `apps/notes/src/components/editor/extensions/ai-block/`

---

## Structured Output

The AI module exposes an `AIStructuredOutputProvider` port for schema-based generation using Zod schemas. Unlike the streaming text completions, this port returns typed objects validated against a Zod schema at generation time.

**Port:** `AIStructuredOutputProvider` (`ai-structured-output.port.ts`)
**Implementation:** `AIStructuredOutputSDKProvider` — uses Vercel AI SDK `generateText()` with `Output.object({ schema })`.

```typescript
interface AIStructuredOutputProvider {
  generateStructuredOutput<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions
  ): Promise<StructuredOutputResult<T>>;
}
```

Used by the artifacts module via `AIGenerationPipeline` to generate flashcards, quizzes, summaries, and mind maps with guaranteed schema conformance.

---

## Artifact Generation

The `artifacts` module (`apps/api/src/modules/artifacts/`) uses the AI structured output port to generate study artifacts from note content. Each artifact type has a Zod schema that enforces the output structure.

**Supported types:**

| Type             | AI Action             | Output Schema      |
| ---------------- | --------------------- | ------------------ |
| `flashcard_deck` | `generate-flashcards` | `FlashcardContent` |
| `quiz`           | `generate-quiz`       | `QuizContent`      |
| `summary`        | `generate-summary`    | `SummaryContent`   |
| `mind_map`       | `generate-mind-map`   | `MindMapContent`   |

**Pipeline:** `AIGenerationPipeline` orchestrates each generation request: rate limit check, model selection via `AIOrchestrator`, structured output call, usage recording. Shared types live in `packages/shared/types/src/lib/artifact.types.ts`.

**Frontend:** `apps/notes/src/components/artifacts/` contains the sidebar, generators, and viewers (flashcard study with SM-2 spaced repetition, quiz sessions, summary viewer, mind map viewer).

---

## Voice Notes

Voice-to-Note is documented separately in [docs/VOICE-NOTE.md](VOICE-NOTE.md). It uses the AI module for transcription (OpenAI Whisper) and note structuring (Claude). Gated by both `ai_enabled` and `voice_notes_enabled` feature flags.

---

## REST API

All endpoints under `/api/v1/ai`. Require `JwtAuthGuard` + feature flag `ai_enabled`.

| Method | Path              | Description                                       |
| ------ | ----------------- | ------------------------------------------------- |
| POST   | `/ai/complete`    | Non-streaming completion. Body: `AICompleteDto`.  |
| GET    | `/ai/usage`       | Daily token + cost usage for authenticated user.  |
| GET    | `/ai/metrics`     | Usage summary. Query: `?period=day\|week\|month`. |
| GET    | `/ai/config`      | All dynamic AI config values (auth required).     |
| PUT    | `/ai/config/:key` | Update a config value (admin only).               |

> Swagger UI available at `/api/docs` in development.

---

## Adding a New Action

1. Add the action string to `AI_ACTION` in `packages/shared/types/src/lib/ai.types.ts`
2. Add a system prompt in `SYSTEM_PROMPTS` in `apps/api/src/modules/ai/domain/constants/system-prompts.ts`
3. If it needs the fast model, add it to `FAST_MODEL_ACTIONS` in the same file
4. If it should be cached, add it to `CACHEABLE_ACTIONS` in `apps/api/src/modules/ai/infrastructure/redis/semantic-cache.service.ts`
5. Add it to the relevant UI config (`ai-actions.config.ts` for bubble menu, `slash-commands.config.ts` for slash commands)
6. Add i18n keys in `packages/shared/i18n/locales/{en,es}/notes.json`
