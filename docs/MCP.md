# Knowtis MCP Server

Model Context Protocol (MCP) server that lets AI assistants (Claude Desktop, Claude Code, Cursor, VS Code Copilot, and any MCP-capable client) manage Knowtis notes programmatically. It exposes 8 tools for notes CRUD, search, and sharing, plus every note as an MCP resource.

The **hosted server is the primary way to connect**:

```text
https://mcp.knowtis.app/mcp
```

It speaks **Streamable HTTP** (stateless), runs on Railway, and is health-checked at `GET /health`.

There are two ways to authenticate:

- **OAuth 2.1 "click to connect"** (recommended) — the client discovers the authorization server, opens a browser for consent, and stores tokens for you. No secret to paste. See [Connect with OAuth](#connect-with-oauth).
- **API keys** (headless / advanced) — a long-lived `knowtis_mcp_...` Bearer token you create and paste into the client config. Best for non-interactive/server contexts. See [API keys (headless / advanced)](#api-keys-headless--advanced).

Every request must carry one or the other as a Bearer token:

```text
Authorization: Bearer <oauth-access-token | knowtis_mcp_...>
```

Without a valid Bearer token the server replies `HTTP 401` with a `WWW-Authenticate: Bearer` challenge (carrying `resource_metadata` when OAuth is enabled, so clients can start discovery).

> **OAuth availability.** The authorization server is gated by the `mcp_oauth` feature flag and is **on by default in every environment** (seeded `true` by migration `0020_enable_mcp_oauth`). Discovery resolves and "click to connect" works as soon as the OAuth env is set (`OAUTH_ISSUER`, `OAUTH_JWKS`, `OAUTH_COOKIE_KEYS`, `MCP_RESOURCE_URL` on the API; `MCP_OAUTH_ISSUER`, `MCP_RESOURCE_URL` on the MCP service). If those are unset the AS stays dormant and clients fall back to API-key auth, even with the flag on.

## Connect with OAuth

Knowtis implements the [MCP authorization spec (revision 2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): the MCP server is an OAuth 2.1 **resource server** and the Knowtis API is the **authorization server**. A conformant client needs nothing but the URL — it discovers everything else.

### How it works

1. The client calls `POST https://mcp.knowtis.app/mcp` with no token and gets `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.knowtis.app/.well-known/oauth-protected-resource", scope="notes:read notes:write notes:share offline_access"`. Clients copy that `scope` verbatim into the authorization request, so the challenge advertises the **full** set — advertising less mints read-only tokens and every write tool then fails on an otherwise successful connection.
2. It fetches that **Protected Resource Metadata** ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)) and learns the authorization server is `https://api.knowtis.app`.
3. It fetches the AS metadata ([RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) / OpenID Connect Discovery) and learns the `authorization`, `token`, `jwks`, and `registration` endpoints.
4. It registers itself — via **Client ID Metadata Documents** (CIMD, `client_id` is the client's own HTTPS URL) or **Dynamic Client Registration** ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591), open — no initial access token) — then runs the **authorization-code + PKCE S256** flow. **PKCE is required.**
5. The browser opens the Knowtis consent page. You sign in (dev or prod account) and approve. The client receives an access token and, for public MCP clients, a refresh token — see [Scopes](#scopes) for exactly when a refresh token is issued.
6. Every subsequent `/mcp` request carries `Authorization: Bearer <access-token>`. The MCP server validates the token (ES256 signature via JWKS, exact `aud`/`iss`, unexpired) and forwards it to the API.

The access token is an **ES256 JWT** whose audience (`aud`) is the MCP resource URL (`https://mcp.knowtis.app/mcp`), valid for **1 hour**. Resource indicators ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)) bind the token to this specific server.

### Discovery URLs

Authorization server (Knowtis API) — served at the **root** of the API origin, `404` while the flag is off:

```text
https://api.knowtis.app/.well-known/oauth-authorization-server
https://api.knowtis.app/.well-known/openid-configuration
```

Its endpoints are absolute and live under `/oauth/...` — `/oauth/auth` (authorization), `/oauth/token`, `/oauth/jwks`, `/oauth/reg` (dynamic client registration), `/oauth/token/revocation`. Read them from the discovery document rather than hardcoding: they are `oidc-provider` defaults and change with its config.

Resource server (MCP) — RFC 9728 metadata, both the root and MCP-endpoint-scoped forms:

```text
https://mcp.knowtis.app/.well-known/oauth-protected-resource
https://mcp.knowtis.app/.well-known/oauth-protected-resource/mcp
```

The resource-server metadata is **env-gated, not flag-gated**: it is advertised whenever the MCP service has its OAuth env set, so it can go live before the authorization server does. While the AS discovery still `404`s, conformant clients simply fall back to API-key auth.

### Scopes

OAuth clients request scopes individually; the consent screen lists each one before you approve.

| Scope            | Grants                                                         |
| ---------------- | -------------------------------------------------------------- |
| `notes:read`     | List and read notes, view collaborators                        |
| `notes:write`    | Create, update, and delete notes                               |
| `notes:share`    | Share notes with other users                                   |
| `offline_access` | Signals the client wants a **refresh token** to stay connected |

`offline_access` is OAuth-only and grants no data access — it only signals that the client wants a refresh token. Per [OIDC Core §11](https://openid.net/specs/openid-connect-core-1_0.html#OfflineAccess) the authorization server **drops `offline_access` from any request whose `prompt` does not contain `consent`**, and MCP clients are inconsistent here: some hardcode `prompt=consent`, others send no scope at all. So rather than depend on the client, Knowtis issues a refresh token to **every public MCP client** — the authorization-code + PKCE flow with no client authentication (`token_endpoint_auth_method: none`) — whether or not `offline_access` survived. This uses oidc-provider's supported `issueRefreshToken` override and is what keeps a connection alive past the 1h access-token expiry; clients that _do_ send `prompt=consent` additionally see "Stay connected" listed on the consent screen. Refresh tokens **rotate on every use with no grace window**: replaying an already-used refresh token revokes the whole token family (`invalid_grant`). They live 30 days for remote (CIMD/URL) clients and 90 days for locally registered clients.

### Clients

**Claude Desktop** — custom connectors support OAuth natively. Add a connector (**Settings > Connectors > Add custom connector**) pointing at `https://mcp.knowtis.app/mcp`. Claude Desktop runs discovery, opens a browser for consent, and stores the tokens. **No `Authorization` header, no `mcp-remote` bridge** — the bridge in [API keys](#api-keys-headless--advanced) is only needed when the flag is off or for API-key auth.

**claude.ai** (web) — custom connectors connect over CIMD: claude.ai identifies itself by its own metadata URL, so there is no manual client registration. Add a custom connector with `https://mcp.knowtis.app/mcp`, then complete the browser consent.

**Claude Code** — add the server, then authenticate interactively:

```bash
claude mcp add --transport http knowtis https://mcp.knowtis.app/mcp
```

Run `/mcp` in a session and choose **Authenticate** — Claude Code opens the browser OAuth flow. No `--header` is needed; the OAuth tokens are managed for you.

**Cursor / VS Code Copilot** — point the client at `https://mcp.knowtis.app/mcp` with no header; both drive the OAuth flow when the server issues an OAuth `401` challenge. (Config file shapes are shown under [API keys](#api-keys-headless--advanced); omit the `headers`/`Authorization` entry to use OAuth.)

### What you see

The consent page (served by the Knowtis web app at `/oauth/consent?uid=...`) shows the **client name**, the **redirect host** the code will be sent to, and the **list of scopes** requested. CIMD clients (identified by an HTTPS `client_id`) get a "verified by URL" badge. Anonymous sessions cannot authorize — you are routed through login first. Approving creates a grant; denying aborts with `access_denied`.

### Managing connections (revocation)

Authorized apps appear in the Knowtis web app under **Settings > Connected apps** — each row shows the app, its scopes, and when it was authorized, with a **Revoke** button. (The section is hidden while the `mcp_oauth` flag is off.)

**Revocation semantics — access tokens are stateless 1h; revoking a grant cuts future refresh, but an already-issued access token works until its exp.** Revoking an app deletes its grant and refresh token at the authorization server, so the client can no longer mint new tokens. But MCP access tokens are stateless ES256 JWTs validated by signature and audience — the MCP server never calls back to the authorization server per request — so an access token issued **before** the revocation keeps working until it expires, up to one hour later. Revocation guarantees no tokens beyond that one-hour window; to cut off a leaked token sooner you must wait out its `exp`.

## API keys (headless / advanced)

API keys are the non-interactive path: a long-lived `knowtis_mcp_...` secret you paste into the client. Use them for servers, scripts, CI, or any client that can't run a browser consent. Create and manage keys in the Knowtis web app under **Settings > Integrations** (see [API Key Management](#api-key-management)). Send the key as a Bearer token on the `/mcp` request.

### Claude Code

```bash
claude mcp add --transport http knowtis https://mcp.knowtis.app/mcp \
  --header "Authorization: Bearer knowtis_mcp_..."
```

### Claude Desktop

With the `mcp_oauth` flag on, prefer the **native custom connector** in [Connect with OAuth](#connect-with-oauth) — no bridge required. Use the bridge below only for API-key auth (or while OAuth is dark): Claude Desktop's custom-connector UI has no field for an `Authorization` header, so an API key must be injected through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Add this to `claude_desktop_config.json` (**Settings > Developer > Edit Config**) and restart Claude Desktop:

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
  -d '{"name": "My Claude Key", "scopes": "notes:read,notes:write,notes:share"}'
```

Response includes the full API key (shown only once):

```json
{
  "id": "uuid",
  "name": "My Claude Key",
  "key": "knowtis_mcp_...",
  "keyPrefix": "knowtis_mcp_...",
  "scopes": "notes:read,notes:write,notes:share",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Available scopes** (API keys use nested CSV bundles; OAuth requests them individually):

- `notes:read` — List and read notes, view collaborators
- `notes:read,notes:write` — Above + create, update, delete notes
- `notes:read,notes:write,notes:share` — Above + share notes with other users

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

## Distribution & Installation

All remote channels point at the same hosted endpoint, `https://mcp.knowtis.app/mcp`; the MCPB bundle is the one local-install path.

### Official MCP Registry

The server is published to the [official MCP registry](https://registry.modelcontextprotocol.io) as `app.knowtis/knowtis` (entry: [`apps/mcp/server.json`](../apps/mcp/server.json)):

```bash
curl https://registry.modelcontextprotocol.io/v0.1/servers/app.knowtis%2Fknowtis/versions/latest
```

Downstream directories — the GitHub MCP Registry (VS Code / Copilot, [github.com/mcp](https://github.com/mcp)), PulseMCP, and Glama — ingest the official registry automatically; propagation can take hours.

### Claude Desktop (MCPB)

1. Download `knowtis-mcp-<version>.mcpb` from the repo's [GitHub Releases](https://github.com/jovandyaz/knowtis-app/releases).
2. Double-click it, or drag it into Claude Desktop.
3. Fill in the **Knowtis API Key** — create one in Knowtis under **Settings > Integrations** (see [API Key Management](#api-key-management)). The **API URL** field defaults to `https://api.knowtis.app`; only change it if self-hosting.

Privately distributed MCPB bundles have **no auto-update** — install new versions manually.

### Remote connect (any OAuth-capable MCP client)

Point the client at `https://mcp.knowtis.app/mcp` — OAuth 2.1 flows automatically (DCR and CIMD are both supported); see [Connect with OAuth](#connect-with-oauth). For headless contexts, an API-key Bearer works instead; see [API keys (headless / advanced)](#api-keys-headless--advanced).

### Cursor deeplink

"Add to Cursor" install link (`config` is the base64 of `{"url":"https://mcp.knowtis.app/mcp"}`):

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=knowtis&config=eyJ1cmwiOiJodHRwczovL21jcC5rbm93dGlzLmFwcC9tY3AifQ==
```

### ChatGPT (developer mode)

**Settings > Apps & Connectors** → enable developer mode → add a connector with URL `https://mcp.knowtis.app/mcp`. OAuth runs automatically.

### Maintainer runbook

The version in `apps/mcp/package.json`, `apps/mcp/mcpb/manifest.json`, and `apps/mcp/server.json` must all match — the pack script fails on `package.json`/`manifest.json` drift.

```bash
# 1. Bump the version in all three:
#    apps/mcp/package.json, apps/mcp/mcpb/manifest.json, apps/mcp/server.json

# 2. Pack the MCPB bundle
pnpm exec nx run mcp:pack-mcpb

# 3. Publish the GitHub Release
gh release create mcp-v<version> dist/apps/mcp-mcpb/knowtis-mcp-<version>.mcpb

# 4. Hash the RELEASE asset (not the local file). First release: ADD the
#    packages entry to apps/mcp/server.json — registryType "mcpb",
#    identifier = the release asset URL, transport {"type":"stdio"},
#    fileSha256 = this hash. Later releases: update identifier + fileSha256.
curl -sL <asset-url> | shasum -a 256

# 5. Publish to the registry (the key lives in the GitHub secret MCP_PUBLISHER_PRIVATE_KEY)
mcp-publisher login http --domain knowtis.app --private-key $MCP_PUBLISHER_PRIVATE_KEY
mcp-publisher publish apps/mcp/server.json
```

Pre-publish gate: `curl -s https://knowtis.app/.well-known/mcp-registry-auth` must return the raw key line (`v=MCPv1; k=ed25519; p=...`), not HTML — HTTP login proves domain ownership against it.

Deprecate a published version:

```bash
mcp-publisher status --status deprecated app.knowtis/knowtis <version>
```

## Tools

All 8 tools are registered via `registerTool` and return a **dual result**: a `structuredContent` object matching the result shape below, plus the same object serialized as JSON in a `text` content block.

| Tool                | Title             | Description                                                  | Parameters                                                            | Result shape                                                                      | Annotations                 | Scope         |
| ------------------- | ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- | ------------- |
| `list-notes`        | List Notes        | List the user's notes by recency, with cursor pagination     | `search?` (string), `limit?` (1–100, default 20), `cursor?` (opaque)  | `{ notes: [{ id, title, updatedAt }], nextCursor? }`                              | read-only, idempotent       | `notes:read`  |
| `search-notes`      | Search Notes      | Hybrid (full-text + semantic) search across accessible notes | `query` (string), `limit?` (1–20, default 20)                         | `{ hits: [{ id, title, updatedAt, isOwner, isSharedWithMe, isPubliclyShared }] }` | read-only, idempotent       | `notes:read`  |
| `get-note`          | Get Note          | Get the full content of a note, returned as **Markdown**     | `noteId` (UUID)                                                       | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }`                 | read-only, idempotent       | `notes:read`  |
| `create-note`       | Create Note       | Create a note (title + optional Markdown content)            | `title` (string), `content?` (Markdown string)                        | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }`                 | create, non-idempotent      | `notes:write` |
| `update-note`       | Update Note       | Update the title or content of an existing note              | `noteId` (UUID), `title?` (string), `content?` (Markdown string)      | `{ note: { id, title, content, ownerId, createdAt, updatedAt } }`                 | destructive, idempotent     | `notes:write` |
| `delete-note`       | Delete Note       | Permanently delete a note (cannot be undone)                 | `noteId` (UUID)                                                       | `{ success, message }`                                                            | destructive, idempotent     | `notes:write` |
| `get-collaborators` | Get Collaborators | List who has access to a note and their permission           | `noteId` (UUID)                                                       | `{ collaborators: [{ userId, email, name, permission }] }`                        | read-only, idempotent       | `notes:read`  |
| `share-note`        | Share Note        | Share a note with another user by their user ID              | `noteId` (UUID), `userId` (UUID), `permission` (`viewer` \| `editor`) | `{ success }`                                                                     | non-destructive, idempotent | `notes:share` |

`create-note` and `update-note` accept **Markdown** content (headings, bold/italic/strike, inline & fenced code, links, ordered/unordered/task lists, blockquotes, horizontal rules, GFM tables, highlight, super/subscript, and Mermaid diagrams). The server converts it to the editor's HTML before persisting — and converts back on read: the `content` in `get-note`, `create-note`, and `update-note` results is always Markdown, never the stored HTML.

`list-notes` orders by recency and paginates with an **opaque cursor**: when more notes remain, the result carries a `nextCursor` to pass to the next call. An invalid or missing cursor starts from the first page.

`search-notes` delegates to the API's hybrid retrieval endpoint (`GET /api/v1/search` — full-text + semantic ranking server-side) and returns the most relevant notes the user can access. Use it to find notes by meaning, then `get-note` to read one.

Annotation semantics (MCP tool hints):

- **read-only** (`list-notes`, `search-notes`, `get-note`, `get-collaborators`) — `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
- **create** (`create-note`) — not read-only, not destructive, `idempotentHint: false` (each call creates a new note).
- **destructive, idempotent** (`update-note`, `delete-note`) — `destructiveHint: true`, `idempotentHint: true`.
- **non-destructive, idempotent** (`share-note`) — not destructive, `idempotentHint: true`.

All tools declare `openWorldHint: false`.

The `initialize` result also declares server **instructions** — a one-paragraph orientation for the model (search with `search-notes`, read with `get-note`, write in Markdown, page `list-notes` by cursor, attach notes as resources).

## Resources

Every note is also exposed as an **MCP resource**, so clients can attach notes as context without a tool call. The server advertises one resource template (via `resources/templates/list`):

```text
knowtis://notes/{noteId}
```

- `resources/list` returns the user's notes ordered by recency in **pages of 20**, with an opaque `nextCursor` when more remain (same cursor mechanics as `list-notes`). Each entry carries the note title as `name` and `mimeType: text/markdown`.
- `resources/read` on a note URI returns a single `text/markdown` content block: a `# <title>` heading followed by the note body converted to Markdown. A URI that doesn't match the template is rejected.

Resource access requires the `notes:read` scope on both auth paths (API key and OAuth), enforced exactly like the tool scope checks.

## Auth Flow

Both auth methods land on the same per-tool scope check; they differ only in how the request-scoped Bearer token becomes a downstream API token.

### API key

```text
Client (Claude / Cursor / VS Code / mcp-remote)
  │
  │  POST /mcp with  Authorization: Bearer knowtis_mcp_...
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
5. **Scope enforcement** happens per tool: each tool declares a required scope (`notes:read`, `notes:write`, or `notes:share`), and a call is rejected if the key's scopes don't include it.

### OAuth access token

A Bearer token **not** prefixed with `knowtis_mcp_` is treated as an OAuth access token. The MCP server verifies it locally with `jose` against the authorization server's JWKS — **ES256** algorithm, exact `issuer` and `audience` (the MCP resource URL), and a required `exp`. An invalid or expired token gets `HTTP 401` with `WWW-Authenticate: Bearer ... error="invalid_token"` and the `resource_metadata` pointer.

Unlike the API-key path there is **no token-exchange**: the verified JWT is forwarded directly as the downstream API Bearer (the API trusts the AS's signing key). Scopes come from the token's `scope`/`scopes` claim and are checked per tool exactly as above. API-key clients are unaffected by OAuth being on — the two paths coexist on the same endpoint, switched by the token prefix.

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

### Enable OAuth locally

To exercise the full OAuth flow (e.g. with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)) against your local stack:

1. **API** (`apps/api/.env`): generate a dev keypair and wire the AS envs.

   ```bash
   npx tsx apps/api/src/scripts/generate-oauth-jwks.ts   # paste output into OAUTH_JWKS
   ```

   ```env
   OAUTH_ISSUER=http://localhost:3333
   OAUTH_JWKS={"keys":[ ... ]}                            # from the script above
   OAUTH_COOKIE_KEYS=<any-random-secret>
   MCP_RESOURCE_URL=http://localhost:3334/mcp
   ```

2. **MCP** (`apps/mcp/.env`): point the resource server at the same AS and audience.

   ```env
   MCP_OAUTH_ISSUER=http://localhost:3333
   MCP_RESOURCE_URL=http://localhost:3334/mcp
   ```

3. **Flag is on by default** (seeded `true` by `0020_enable_mcp_oauth`). If a legacy DB still has it off, enable it:

   ```sql
   UPDATE feature_flags SET enabled = true WHERE key = 'mcp_oauth';
   ```

`MCP_RESOURCE_URL` must be byte-identical on both sides (no trailing slash) — it is the token audience, and any mismatch fails verification.

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
| `MCP_OAUTH_ISSUER`    | No (OAuth)      | empty                                    | Authorization server issuer; must equal the API's `OAUTH_ISSUER`     |
| `MCP_RESOURCE_URL`    | No (OAuth)      | empty                                    | This server's canonical resource URL = the token audience            |

`MCP_OAUTH_ISSUER` and `MCP_RESOURCE_URL` are **both-or-neither**: set both to turn on resource-server mode (RFC 9728 metadata + OAuth-aware 401 challenge + ES256 token verification); leave both empty for API-key-only behavior. Setting only one fails fast at startup.

DNS-rebinding protection is **enabled automatically whenever `MCP_ALLOWED_HOSTS` or `MCP_ALLOWED_ORIGINS` is non-empty**. In development the allowed-hosts default keeps it on for localhost. In production the server **refuses to start unless at least one of these variables is set** (the deployed config sets `MCP_ALLOWED_HOSTS`, see [Deployment](#deployment)). When `MCP_ALLOWED_ORIGINS` is set, the CORS `Access-Control-Allow-Origin` on `/mcp` is restricted to the same list; otherwise it stays `*` (auth is a Bearer token, never cookies).

For **stdio** mode (`stdio.ts`), use `KNOWTIS_API_URL` instead of `API_INTERNAL_URL`, and pass the API key as an env var (stdio is API-key only):

| Variable          | Required | Description                    |
| ----------------- | -------- | ------------------------------ |
| `KNOWTIS_API_URL` | Yes      | Knowtis API base URL           |
| `KNOWTIS_API_KEY` | Yes      | Your MCP API key for this host |

### Source layout

```text
apps/mcp/src/
├── index.ts                  # HTTP entry point (Hono + @hono/node-server)
├── stdio.ts                  # stdio entry point (dev-only)
├── server.ts                 # MCP server factory (instructions, tools, resources)
├── transport.ts              # Hono app: /health, CORS, PRM well-knowns, /mcp (Bearer check + Streamable HTTP)
├── config.ts                 # Zod-validated configuration
├── auth/
│   ├── auth-service.ts       # API key → JWT exchange, SHA-256-keyed cache, scope checks
│   ├── credentials.ts        # Bearer classification (api-key vs oauth)
│   ├── oauth-verifier.ts     # ES256 access-token verification via remote JWKS (jose)
│   └── token-cache.ts        # In-memory token cache with expiry
├── api-client/
│   ├── client.ts             # Typed HTTP client for the Knowtis API
│   ├── notes.api.ts          # Notes API methods
│   ├── search.api.ts         # GET /api/v1/search (hybrid retrieval)
│   └── sharing.api.ts        # Sharing API methods
├── middleware/
│   └── logger.ts             # Structured logging
├── resources/
│   └── note-resources.ts     # knowtis://notes/{noteId} list/read/templates handlers
├── tools/
│   ├── notes.tools.ts        # list/search/get/create/update/delete-note
│   ├── sharing.tools.ts      # get-collaborators, share-note
│   ├── wrap-tool-handler.ts  # Auth + scope + logging + dual-result wrapper
│   └── format-error.ts       # Tool error formatting
└── utils/
    ├── html-to-markdown.ts   # Editor HTML → Markdown for reads (turndown)
    ├── markdown-to-html.ts   # Markdown → editor HTML for create/update
    └── note-cursor.ts        # Opaque base64url recency cursor + pagination
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

To enable OAuth in production, set on the **MCP** service `MCP_OAUTH_ISSUER=https://api.knowtis.app` and `MCP_RESOURCE_URL=https://mcp.knowtis.app/mcp`, and on the **API** service `OAUTH_ISSUER=https://api.knowtis.app`, `OAUTH_JWKS` (a **prod-generated** keypair — never the dev one), `OAUTH_COOKIE_KEYS`, and `MCP_RESOURCE_URL=https://mcp.knowtis.app/mcp`. The resource server can be deployed with its env set while `mcp_oauth` stays off (it is env-gated); flip the flag to turn on the authorization server.

Deploys are CI-driven via `railway up`, gated on the `mcp` project being affected on `main`. `railway.toml` deliberately has no `watchPatterns`: Railway checks them against the uploaded snapshot and **skips the build** when no watched file changed — silently deploying nothing while the CI job reports success. Since [config.ts](../apps/mcp/src/config.ts) fails closed, a deployment missing both allowlist variables refuses to boot and the previous deployment stays live.

### DNS-rebinding protection

Setting `MCP_ALLOWED_HOSTS = "mcp.knowtis.app"` in production turns on the transport's DNS-rebinding protection: it validates the incoming `Host` header against the allow-list so a malicious page can't rebind a local/attacker DNS name to the server. Add `MCP_ALLOWED_ORIGINS` if you also want to pin allowed `Origin` values.

### CORS

The `/mcp` route allows any origin and permits the `Content-Type`, `Authorization`, `Mcp-Session-Id`, and `MCP-Protocol-Version` request headers, exposing `Mcp-Session-Id` and `WWW-Authenticate` back to the client. The `/.well-known/*` metadata routes allow any origin so clients can discover them cross-origin. The Bearer token (API key or OAuth access token) travels in the standard `Authorization` header — the server reads it from that header, not from request metadata.
