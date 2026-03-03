# AI Module

## Overview

AI text assistant integrated into the Tiptap editor. Supports streaming responses over WebSocket and non-streaming over REST. Gated by the `AI_ENABLED` feature flag.

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
│   ├── constants/           # Model pricing
│   ├── errors/              # AIErrors + AIErrorCodes
│   ├── ports/               # AICompletionProvider, AICache, AIUsageRepository, RateLimitProvider
│   ├── services/            # input-sanitizer, token-estimator
│   └── value-objects/       # AIAction, AIModel, TokenUsage
├── application/
│   ├── commands/            # StreamTextHandler, CompleteTextHandler
│   └── services/            # AIOrchestrator, AIRateLimitService
├── infrastructure/
│   ├── persistence/         # DrizzleAIUsageRepository
│   ├── providers/           # AISDKProvider (Vercel AI SDK)
│   └── redis/               # AIRedisProvider, RedisRateLimitService, SemanticCacheService
└── testing/                 # createMockConfig helper

apps/notes/src/components/editor/ai/
├── AIBubbleMenu.tsx           # Context menu on text selection
├── AIResultPanel.tsx          # Tippy-positioned panel below selection
├── AIStreamingPreview.tsx     # Streaming text display + accept/discard
├── SlashCommandMenu.tsx       # Slash command (/) dropdown
├── ai-actions.config.ts       # Bubble menu action definitions
└── slash-commands.config.ts   # Slash command definitions

apps/notes/src/components/editor/extensions/
├── GhostText.ts               # Tiptap extension for inline autocomplete
└── GhostText.css

apps/notes/src/stores/
└── ai.store.ts                # Zustand store (status, streamedText, selectionRange)

libs/api-client/src/lib/
└── ai.client.ts               # Socket.io client for /ai namespace

libs/shared/types/src/lib/
└── ai.types.ts                # AIAction, AILanguage, AITone constants + types
```

### Dependency Flow

```
AIGateway / AIController
  → StreamTextHandler / CompleteTextHandler
    → AIOrchestrator (model selection, prompt building)
    → AIRateLimitService (check + record)
    → AICompletionProvider port ← AISDKProvider
    → AICache port             ← SemanticCacheService
    → AIUsageRepository port   ← DrizzleAIUsageRepository
    → RateLimitProvider port   ← RedisRateLimitService
```

### Ports & Adapters

| DI Symbol                | Interface              | Implementation             |
| ------------------------ | ---------------------- | -------------------------- |
| `AI_COMPLETION_PROVIDER` | `AICompletionProvider` | `AISDKProvider`            |
| `AI_USAGE_REPOSITORY`    | `AIUsageRepository`    | `DrizzleAIUsageRepository` |
| `RATE_LIMIT_PROVIDER`    | `RateLimitProvider`    | `RedisRateLimitService`    |
| `AI_CACHE`               | `AICache`              | `SemanticCacheService`     |

---

## Actions, Languages, and Tones

All constants are defined in `libs/shared/types/src/lib/ai.types.ts` and shared between frontend and backend.

### Actions

| Action            | Model   | Cacheable | Description                       |
| ----------------- | ------- | --------- | --------------------------------- |
| `summarize`       | default | Yes       | Concise summary of content        |
| `expand`          | default | No        | Expand with more detail           |
| `translate`       | default | Yes       | Translate to target language      |
| `tone`            | default | No        | Rewrite in requested tone         |
| `outline`         | default | Yes       | Structured outline from content   |
| `action-items`    | default | Yes       | Extract checklist of action items |
| `ghost-text`      | fast    | No        | Inline autocomplete at cursor     |
| `chat`            | default | No        | Q&A about note content            |
| `improve-writing` | default | No        | Improve clarity and readability   |
| `fix-spelling`    | default | No        | Fix spelling and grammar          |
| `make-shorter`    | default | No        | Make text more concise            |
| `make-longer`     | default | No        | Expand text with more detail      |

**Model:** `default` = claude-sonnet, `fast` = claude-haiku. Configured via `FAST_MODEL_ACTIONS` in `ai-orchestrator.service.ts`.

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
      estimateTokenCount()                  # rough token estimate
      AIRateLimitService.checkLimit()       # Redis or PG
      AIOrchestrator.selectModel()          # haiku if ghost-text, sonnet otherwise
      SemanticCacheService.get()            # hash(action:model:prompt) lookup
        if hit → emit ai:chunk + ai:done → done
      AISDKProvider.streamCompletion()
      for each chunk → emit 'ai:chunk'
      await usage from provider
      AIRateLimitService.recordUsage()      # PG write + Redis correction
      SemanticCacheService.set()            # cache if cacheable action
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
**Feature gate:** If `AI_ENABLED !== 'true'`, server emits `ai:error` with `AI_FEATURE_DISABLED` and disconnects.

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

| Code                     | Cause                               |
| ------------------------ | ----------------------------------- |
| `AI_RATE_LIMIT_EXCEEDED` | Daily token or cost limit reached   |
| `AI_FEATURE_DISABLED`    | `AI_ENABLED` is not `'true'`        |
| `AUTH_REQUIRED`          | Missing or invalid JWT              |
| `VALIDATION_ERROR`       | Invalid action, content too long    |
| `AI_PROVIDER_ERROR`      | Upstream Anthropic API failure      |
| `AI_INVALID_MODEL`       | Model string not in supported list  |
| `AI_INVALID_ACTION`      | Action string not in supported list |
| `AI_INTERNAL_ERROR`      | Unexpected server error             |

---

## Rate Limiting

Per-user daily limits enforced by `AIRateLimitService`.

**Strategy:** Redis-first (atomic, fast). Falls back to PostgreSQL aggregate query if Redis is unavailable.

**Limit check:** Before each request, the service checks estimated token count + current daily usage against `AI_DAILY_TOKEN_LIMIT` and `AI_DAILY_COST_LIMIT_USD`.

**Usage correction:** After the request completes, Redis counters are corrected with actual token counts (the pre-request check used an estimate).

**Daily reset:** Midnight UTC (`setUTCHours(0,0,0,0)`).

---

## Response Caching

`SemanticCacheService` caches responses using a SHA-256 hash of `action:model:prompt` as the Redis key.

**Cacheable actions:** `summarize`, `translate`, `outline`, `action-items`

**Not cached:** `ghost-text`, `chat`, `tone`, `expand`, `improve-writing`, `fix-spelling`, `make-shorter`, `make-longer`

Cache is bypassed on cancelled requests. TTL is configurable via `AI_CACHE_TTL_SECONDS` (default: 3600s).

---

## Environment Variables

All AI variables go in `apps/api/.env`. `ANTHROPIC_API_KEY` is required when `AI_ENABLED=true`.

| Variable                     | Required        | Default                               | Description                   |
| ---------------------------- | --------------- | ------------------------------------- | ----------------------------- |
| `AI_ENABLED`                 | Yes             | `false`                               | Feature gate                  |
| `ANTHROPIC_API_KEY`          | When AI_ENABLED | —                                     | Anthropic API key             |
| `OPENAI_API_KEY`             | No              | —                                     | Reserved (no provider yet)    |
| `AI_DEFAULT_MODEL`           | No              | `anthropic:claude-sonnet-4-20250514`  | Model for most actions        |
| `AI_FAST_MODEL`              | No              | `anthropic:claude-haiku-4-5-20251001` | Model for `ghost-text`        |
| `AI_FALLBACK_MODEL`          | No              | `anthropic:claude-haiku-4-5-20251001` | Fallback on provider error    |
| `AI_DAILY_TOKEN_LIMIT`       | No              | `100000`                              | Per-user daily token cap      |
| `AI_DAILY_COST_LIMIT_USD`    | No              | `1.0`                                 | Per-user daily cost cap (USD) |
| `AI_MAX_RETRIES`             | No              | `3`                                   | Provider retry count          |
| `AI_TIMEOUT_MS`              | No              | `30000`                               | Total request timeout (ms)    |
| `AI_STREAM_CHUNK_TIMEOUT_MS` | No              | `10000`                               | Per-chunk timeout (ms)        |
| `AI_CACHE_ENABLED`           | No              | `true`                                | Enable response cache         |
| `AI_CACHE_TTL_SECONDS`       | No              | `3600`                                | Cache TTL (seconds)           |

---

## Database Schema

One table: `ai_usage`.

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

---

## REST API

All endpoints under `/api/v1/ai`. Require `JwtAuthGuard` + feature flag `ai_enabled`.

| Method | Path           | Description                                       |
| ------ | -------------- | ------------------------------------------------- |
| POST   | `/ai/complete` | Non-streaming completion. Body: `AICompleteDto`.  |
| GET    | `/ai/usage`    | Daily token + cost usage for authenticated user.  |
| GET    | `/ai/metrics`  | Usage summary. Query: `?period=day\|week\|month`. |

> Swagger UI available at `/api/docs` in development.

---

## Adding a New Action

1. Add the action string to `AI_ACTION` in `libs/shared/types/src/lib/ai.types.ts`
2. Add a system prompt in `SYSTEM_PROMPTS` in `apps/api/src/modules/ai/application/services/ai-orchestrator.service.ts`
3. If it needs the fast model, add it to `FAST_MODEL_ACTIONS` in the same file
4. If it should be cached, add it to `CACHEABLE_ACTIONS` in `apps/api/src/modules/ai/infrastructure/redis/semantic-cache.service.ts`
5. Add it to the relevant UI config (`ai-actions.config.ts` for bubble menu, `slash-commands.config.ts` for slash commands)
6. Add i18n keys in `libs/shared/i18n/locales/{en,es}/notes.json`
