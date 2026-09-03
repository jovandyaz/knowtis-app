# @knowtis/api-client

The frontend's HTTP/WebSocket layer: a shared `HttpClient` with automatic token refresh, typed REST adapters per domain, and the streaming clients for AI and the copilot agent. Every call from `apps/notes`, `apps/backoffice` and the `libs/data-access/*` hooks to the API goes through here.

## Features

- **`HttpClient`** — `fetch` wrapper that injects the `Authorization: Bearer` token, sends `credentials: 'include'` (for the refresh cookie: `rid` for notes, `rid_bo` for backoffice; see `apps/api/src/modules/auth/utils/cookie.utils.ts`), and on a `401` runs a refresh callback then retries the request once. Surfaces typed `ApiClientError` / `FieldError`.
- **Shared token-refresh policy** — `createTokenRefreshPolicy` deduplicates concurrent refreshes and is reused by both the AI socket and the Hocuspocus collaboration client (single source of truth for refresh timing).
- **WebSocket URL derivation** — `deriveWsBaseUrl` turns the HTTP API base URL into the WS origin.
- **Streaming clients** — `aiClient` (text completion) and `agentClient` (copilot turns: chunks, proposals, HITL commit, web sources) over Socket.IO.
- **Typed REST adapters** — one per domain, all built on the shared `HttpClient`.

## Public API

Exported from [`src/index.ts`](src/index.ts):

| Export                                                                                     | Purpose                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `HttpClient`, `httpClient`, `IHttpClient`                                                  | Core HTTP client (singleton + class) — [http-client.ts](src/lib/http-client.ts)                                                |
| `ApiClientError`, `FieldError`, `TokenProvider`                                            | Error + auth types                                                                                                             |
| `isEmailNotVerifiedError`, `retryAfterMsOf`                                                | Error predicates: 403 with the email-not-verified code; server-named `Retry-After` wait in ms                                  |
| `refreshSessionTokens`, `withAuthRefreshLock`, `AUTH_REFRESH_LOCK`                         | Single-flight `/auth/refresh` serialized across tabs with the Web Locks API — [session-refresh.ts](src/lib/session-refresh.ts) |
| `classifyRefreshFailure`, `RefreshFailure`                                                 | `rejected` (400/401/403: drop the identity) vs `unavailable` (keep it) — [refresh-failure.ts](src/lib/refresh-failure.ts)      |
| `createTokenRefreshPolicy`, `TokenRefreshPolicy`, `TokenRefreshHandlers`, `RefreshOutcome` | Shared 401-refresh policy — [token-refresh-policy.ts](src/lib/token-refresh-policy.ts)                                         |
| `deriveWsBaseUrl`                                                                          | HTTP→WS origin derivation — [ws-url.ts](src/lib/ws-url.ts)                                                                     |
| `aiClient`, `AIClient`                                                                     | AI text streaming over Socket.IO                                                                                               |
| `agentClient`, `AgentClient`                                                               | Copilot agent streaming (chunks/proposals/committed/web sources)                                                               |
| `notesApi`                                                                                 | Notes CRUD + collaborators/sharing                                                                                             |
| `organizationApi`                                                                          | AI organization suggestions (`/ai/organization/suggest`)                                                                       |
| `tagsApi`                                                                                  | Tag catalog read/update                                                                                                        |
| `oauthApi`                                                                                 | Hosted OAuth consent screen transport for MCP clients                                                                          |
| `usersApi`                                                                                 | Profile read/update                                                                                                            |
| `artifactsApi`                                                                             | Flashcards / quizzes / summaries generation + review                                                                           |
| `imagesApi`                                                                                | Editor image upload                                                                                                            |
| `mcpKeysApi`                                                                               | MCP API key management                                                                                                         |
| `aiModelsApi`                                                                              | Copilot model catalog (`/ai/models`) + user model preferences (`getPreferences` / `updatePreferences` over `/ai/preferences`)  |
| `aiKeysApi`                                                                                | BYOK per-user provider keys                                                                                                    |

Plus exported types (`NoteWithAccess`, `NoteDetail`, `AgentStreamHandle`, `UserProfile`, `McpApiKey`, ...) — see `src/index.ts`.

## Token refresh flow

```
request → 401 → HttpClient runs refresh callback (POST /auth/refresh, cookie sent via credentials:'include')
        → on success: retry original request once
        → on failure: surface ApiClientError (caller logs out)
```

The refresh callback is wired in `apps/notes` via `httpClient.setRefreshTokenCallback()`, and `createTokenRefreshPolicy` is shared with the AI socket and Hocuspocus so all three refresh through one coordinated path. See [docs/AUTH.md](../../docs/AUTH.md) and [docs/AI.md](../../docs/AI.md).

## Project structure

```
src/
├── lib/
│   ├── http-client.ts            # HttpClient + 401 refresh/retry
│   ├── token-refresh-policy.ts   # createTokenRefreshPolicy (shared)
│   ├── ws-url.ts                 # deriveWsBaseUrl
│   ├── ai.client.ts              # aiClient (text streaming)
│   ├── agent.client.ts           # agentClient (copilot turns)
│   ├── session-refresh.ts        # refreshSessionTokens + withAuthRefreshLock
│   ├── refresh-failure.ts        # classifyRefreshFailure
│   ├── retry-after.ts            # parseRetryAfterMs + RETRY_AFTER_HEADER (internal)
│   ├── notes.api.ts  users.api.ts  artifacts.api.ts
│   ├── images.api.ts  mcp-keys.api.ts  oauth.api.ts
│   ├── organization.api.ts  tags.api.ts
│   ├── ai-models.api.ts  ai-keys.api.ts
│   └── config.ts                 # DEFAULT_API_CONFIG, VITE_API_URL fallback (internal)
└── index.ts                      # Public API
```

## Testing

Source-only Nx library (no build target). Project name `@knowtis/api-client`; the `test` target uses the legacy `@nx/vite:test` executor.

```bash
nx test @knowtis/api-client
nx lint @knowtis/api-client
```
