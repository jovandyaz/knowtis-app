# Knowtis MCP Server

Model Context Protocol (MCP) server that lets AI assistants (Claude Desktop, Claude Code, Cursor, VS Code Copilot, and any MCP-capable client) manage Knowtis notes programmatically. It exposes 7 tools for notes CRUD and sharing.

The **hosted server is the primary way to connect**:

```text
https://mcp.knowtis.app/mcp
```

It speaks **Streamable HTTP** (stateless), runs on Railway, and is health-checked at `GET /health`. Authenticate every request with a Knowtis MCP API key as a Bearer token:

```text
Authorization: Bearer knowtis_mcp_...
```

Without a valid Bearer token the server replies `HTTP 401` with a `WWW-Authenticate: Bearer` challenge. Create and manage keys in the Knowtis web app under **Settings > Integrations** (see [API Key Management](#api-key-management)).

> OAuth "click to connect" (connect without pasting an API key) is planned for phase F2.

## Quick Connect

Point your client at `https://mcp.knowtis.app/mcp` and send your API key in the `Authorization` header.

### Claude Code

```bash
claude mcp add --transport http knowtis https://mcp.knowtis.app/mcp \
  --header "Authorization: Bearer knowtis_mcp_..."
```

### Claude Desktop

Claude Desktop's custom-connectors UI only supports OAuth — there is no field for an `Authorization` header, so until OAuth ships (F2) bridge through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Add this to `claude_desktop_config.json` (**Settings > Developer > Edit Config**) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "knowtis": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.knowtis.app/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer knowtis_mcp_..."
      }
    }
  }
}
```

The `Authorization:${AUTH_HEADER}` form (no space, value in `env`) works around a Claude Desktop bug on Windows that splits `args` containing spaces.

### Cursor

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "knowtis": {
      "url": "https://mcp.knowtis.app/mcp",
      "headers": {
        "Authorization": "Bearer knowtis_mcp_..."
      }
    }
  }
}
```

### VS Code (Copilot MCP)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "knowtis": {
      "type": "http",
      "url": "https://mcp.knowtis.app/mcp",
      "headers": {
        "Authorization": "Bearer knowtis_mcp_..."
      }
    }
  }
}
```

### Legacy stdio-only clients

For clients that can only launch a local stdio process, bridge to the hosted endpoint with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```bash
npx mcp-remote https://mcp.knowtis.app/mcp \
  --header "Authorization: Bearer knowtis_mcp_..."
```

## API Key Management

API keys are managed from the Knowtis web app under **Settings > Integrations**, or via the API directly. All key-management endpoints require JWT authentication.

### Create a key

```bash
curl -X POST http://localhost:3333/api/v1/mcp/keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Claude Key", "scopes": "read,write,share"}'
```

Response includes the full API key (shown only once):

```json
{
  "id": "uuid",
  "name": "My Claude Key",
  "key": "knowtis_mcp_...",
  "keyPrefix": "knowtis_mcp_...",
  "scopes": "read,write,share",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Available scopes:**

- `read` — List and read notes, view collaborators
- `read,write` — Above + create, update, delete notes
- `read,write,share` — Above + share notes with other users

### List keys

```bash
curl http://localhost:3333/api/v1/mcp/keys \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Revoke a key

```bash
curl -X DELETE http://localhost:3333/api/v1/mcp/keys/{keyId} \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Revocation stops new token exchanges immediately; tokens already issued for the key remain valid for up to 15 minutes.

## Tools

All 7 tools are registered via `registerTool` and return a **dual result**: a `structuredContent` object matching the result shape below, plus the same object serialized as JSON in a `text` content block.

| Tool                | Title             | Description                                        | Parameters                                                            | Result shape                                                      | Annotations                 | Scope   |
| ------------------- | ----------------- | -------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------- | ------- |
| `list-notes`        | List Notes        | List the user's notes with an optional search      | `search?` (string)                                                    | `{ notes: [{ id, title, updatedAt }] }`                           | read-only, idempotent       | `read`  |
| `get-note`          | Get Note          | Get the full content of a specific note by ID      | `noteId` (UUID)                                                       | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }` | read-only, idempotent       | `read`  |
| `create-note`       | Create Note       | Create a note (title + optional Markdown content)  | `title` (string), `content?` (Markdown string)                        | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }` | create, non-idempotent      | `write` |
| `update-note`       | Update Note       | Update the title or content of an existing note    | `noteId` (UUID), `title?` (string), `content?` (Markdown string)      | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }` | destructive, idempotent     | `write` |
| `delete-note`       | Delete Note       | Permanently delete a note (cannot be undone)       | `noteId` (UUID)                                                       | `{ success, message }`                                            | destructive, idempotent     | `write` |
| `get-collaborators` | Get Collaborators | List who has access to a note and their permission | `noteId` (UUID)                                                       | `{ collaborators: [{ userId, email, name, permission }] }`        | read-only, idempotent       | `read`  |
| `share-note`        | Share Note        | Share a note with another user by their user ID    | `noteId` (UUID), `userId` (UUID), `permission` (`viewer` \| `editor`) | `{ success }`                                                     | non-destructive, idempotent | `share` |

`create-note` and `update-note` accept **Markdown** content (headings, bold/italic/strike, inline & fenced code, links, ordered/unordered/task lists, blockquotes, horizontal rules, GFM tables, highlight, super/subscript, and Mermaid diagrams). The server converts it to the editor's HTML before persisting.

Annotation semantics (MCP tool hints):

- **read-only** (`list-notes`, `get-note`, `get-collaborators`) — `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
- **create** (`create-note`) — not read-only, not destructive, `idempotentHint: false` (each call creates a new note).
- **destructive, idempotent** (`update-note`, `delete-note`) — `destructiveHint: true`, `idempotentHint: true`.
- **non-destructive, idempotent** (`share-note`) — not destructive, `idempotentHint: true`.

All tools declare `openWorldHint: false`.

## Auth Flow

```text
Client (Claude / Cursor / VS Code / mcp-remote)
  │
  │  POST /mcp with  Authorization: Bearer <API key>
  │  (missing/blank → HTTP 401 + WWW-Authenticate: Bearer challenge)
  ▼
MCP Server (apps/mcp — Hono, Streamable HTTP)
  │
  │  On first tool call, exchange the API key for a short-lived JWT:
  │  POST /api/v1/auth/token-exchange { apiKey }
  ▼
Knowtis API (apps/api)
  │
  │  Returns { accessToken, expiresIn, scopes }
  ▼
MCP Server caches the JWT
  │
  │  Bearer <JWT> on all downstream API calls
  ▼
Notes / Sharing API endpoints
```

1. The client sends the API key as a Bearer token on the `/mcp` request. If the `Authorization` header is missing or malformed, the request is rejected at the door with `HTTP 401` and a `WWW-Authenticate: Bearer` challenge — no tool runs.
2. On the first tool call, the server exchanges the API key for a short-lived JWT via `POST /api/v1/auth/token-exchange`.
3. The JWT is cached in a **module-scope, shared token cache** keyed by the **SHA-256 hash of the full API key** (never the raw key), with a 1-minute buffer subtracted from the reported expiry. The cache is shared across all requests handled by the process.
4. Subsequent calls reuse the cached JWT as a Bearer token until it nears expiry.
5. **Scope enforcement** happens per tool: each tool declares a required scope (`read`, `write`, or `share`), and a call is rejected if the key's scopes don't include it.

## Local Development

The **stdio** entry point (`dist/apps/mcp/stdio.js`) is **for local development only** — the hosted Streamable HTTP server is the path for real clients.

### Run the server

```bash
# 1. Create the local env file (the serve target reads apps/mcp/.env)
cp apps/mcp/.env.example apps/mcp/.env

# 2. Start the API backend (port 3333)
pnpm dev:api

# 3. Serve the MCP server locally
pnpm nx serve mcp
```

The server exposes:

- `GET /health` — Health check, returns `{ status: "ok", version: "<package.json version>" }`
- `ALL /mcp` — Streamable HTTP transport (stateless; each request spins up a fresh transport)

The server version reported to clients (and on `/health`) comes from `apps/mcp/package.json` — there is no version env var.

### Build, test, lint

```bash
pnpm nx build mcp
pnpm nx test mcp
pnpm nx lint mcp
pnpm typecheck
```

### Environment variables

HTTP mode (`index.ts`):

| Variable              | Required        | Default                                  | Description                                                          |
| --------------------- | --------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `API_INTERNAL_URL`    | Yes (HTTP mode) | —                                        | Knowtis API base URL                                                 |
| `PORT`                | No              | `3334`                                   | HTTP server port                                                     |
| `MCP_SERVER_NAME`     | No              | `knowtis-mcp`                            | Server name reported to clients                                      |
| `NODE_ENV`            | No              | `development`                            | `development` \| `production` \| `test`                              |
| `MCP_ALLOWED_HOSTS`   | Yes (prod)      | dev: `localhost:<PORT>,127.0.0.1:<PORT>` | Comma-separated `Host` values allowed for DNS-rebinding protection   |
| `MCP_ALLOWED_ORIGINS` | No              | empty                                    | Comma-separated `Origin` values allowed for DNS-rebinding protection |

DNS-rebinding protection is **enabled automatically whenever `MCP_ALLOWED_HOSTS` or `MCP_ALLOWED_ORIGINS` is non-empty**. In development the allowed-hosts default keeps it on for localhost. In production the server **refuses to start unless at least one of these variables is set** (the deployed config sets `MCP_ALLOWED_HOSTS`, see [Deployment](#deployment)). When `MCP_ALLOWED_ORIGINS` is set, the CORS `Access-Control-Allow-Origin` on `/mcp` is restricted to the same list; otherwise it stays `*` (auth is a Bearer token, never cookies).

For **stdio** mode (`stdio.ts`), use `KNOWTIS_API_URL` instead of `API_INTERNAL_URL`, and pass the API key as an env var:

| Variable          | Required | Description                    |
| ----------------- | -------- | ------------------------------ |
| `KNOWTIS_API_URL` | Yes      | Knowtis API base URL           |
| `KNOWTIS_API_KEY` | Yes      | Your MCP API key for this host |

### Source layout

```text
apps/mcp/src/
├── index.ts                  # HTTP entry point (Hono + @hono/node-server)
├── stdio.ts                  # stdio entry point (dev-only)
├── server.ts                 # MCP server factory (registers tools)
├── transport.ts              # Hono app: /health, CORS, /mcp (Bearer check + Streamable HTTP)
├── config.ts                 # Zod-validated configuration
├── auth/
│   ├── auth-service.ts       # API key → JWT exchange, SHA-256-keyed cache, scope checks
│   └── token-cache.ts        # In-memory token cache with expiry
├── api-client/
│   ├── client.ts             # Typed HTTP client for the Knowtis API
│   ├── notes.api.ts          # Notes API methods
│   └── sharing.api.ts        # Sharing API methods
├── middleware/
│   └── logger.ts             # Structured logging
├── tools/
│   ├── notes.tools.ts        # list/get/create/update/delete-note
│   ├── sharing.tools.ts      # get-collaborators, share-note
│   ├── wrap-tool-handler.ts  # Auth + scope + logging + dual-result wrapper
│   └── format-error.ts       # Tool error formatting
└── utils/
    └── markdown-to-html.ts   # Markdown → editor HTML for create/update
```

## Deployment

### Railway

The MCP server runs as its own Railway service, configured in [`apps/mcp/railway.toml`](../apps/mcp/railway.toml):

| Setting           | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| `buildCommand`    | `NODE_ENV=development pnpm install --frozen-lockfile && pnpm nx build mcp` |
| `startCommand`    | `node dist/apps/mcp/index.js`                                              |
| `healthcheckPath` | `/health`                                                                  |

Railway config-as-code cannot set environment variables (`railway.toml` has no `[env]` section). The `deploy-mcp` job in `.github/workflows/ci.yml` pins `NODE_ENV=production` and `MCP_ALLOWED_HOSTS=mcp.knowtis.app` on the service via `railway variable set` before every `railway up`. `API_INTERNAL_URL` is a Railway service variable pointing at the API's internal URL (e.g. `http://api.railway.internal:3333`).

Deploys are CI-driven via `railway up`, gated on the `mcp` project being affected on `main`. `railway.toml` deliberately has no `watchPatterns`: Railway checks them against the uploaded snapshot and **skips the build** when no watched file changed — silently deploying nothing while the CI job reports success. Since [config.ts](../apps/mcp/src/config.ts) fails closed, a deployment missing both allowlist variables refuses to boot and the previous deployment stays live.

### DNS-rebinding protection

Setting `MCP_ALLOWED_HOSTS = "mcp.knowtis.app"` in production turns on the transport's DNS-rebinding protection: it validates the incoming `Host` header against the allow-list so a malicious page can't rebind a local/attacker DNS name to the server. Add `MCP_ALLOWED_ORIGINS` if you also want to pin allowed `Origin` values.

### CORS

The `/mcp` route allows any origin and permits the `Content-Type`, `Authorization`, `Mcp-Session-Id`, and `MCP-Protocol-Version` request headers, exposing `Mcp-Session-Id` back to the client. The API key travels in the standard `Authorization: Bearer` header — the server reads it from that header, not from request metadata.
