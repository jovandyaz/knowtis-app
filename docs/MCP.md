# Knowtis MCP Server

Model Context Protocol (MCP) server that lets AI assistants (Claude, Cursor, VS Code Copilot) manage Knowtis notes programmatically. Provides 7 tools for notes CRUD and sharing via a standalone Hono app.

## Supported Clients

- **Claude Code** (`.mcp.json` or `claude_desktop_config.json`)
- **Claude Desktop** (`claude_desktop_config.json`)
- **Cursor** (`.cursor/mcp.json`)
- **VS Code Copilot** (`.vscode/mcp.json`)

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- Running Knowtis API (port 3333)
- An MCP API key (see [API Key Management](#api-key-management))

### Local Development

```bash
# 1. Start the API backend
pnpm dev:api

# 2. Build the MCP server
pnpm nx build mcp

# 3. Start the MCP server (Streamable HTTP on port 3334)
API_INTERNAL_URL=http://localhost:3333 node dist/apps/mcp/index.js
```

The server exposes:

- `GET /health` — Health check (returns `{ status: "ok", version: "..." }`)
- `ALL /mcp` — Streamable HTTP transport (stateless)

### Environment Variables

| Variable             | Required        | Default       | Description                     |
| -------------------- | --------------- | ------------- | ------------------------------- |
| `API_INTERNAL_URL`   | Yes (HTTP mode) | —             | Knowtis API base URL            |
| `PORT`               | No              | `3334`        | HTTP server port                |
| `MCP_SERVER_NAME`    | No              | `knowtis-mcp` | Server name reported to clients |
| `MCP_SERVER_VERSION` | No              | `0.0.1`       | Server version                  |
| `NODE_ENV`           | No              | `development` | Environment                     |

For stdio mode, use `KNOWTIS_API_URL` instead of `API_INTERNAL_URL`:

| Variable          | Required | Description                               |
| ----------------- | -------- | ----------------------------------------- |
| `KNOWTIS_API_URL` | Yes      | Knowtis API base URL                      |
| `KNOWTIS_API_KEY` | Yes      | Your MCP API key (provided by the client) |

## API Key Management

API keys are managed from the Knowtis web app under **Settings > Integrations**, or via the API directly. All API endpoints require JWT authentication.

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

## Client Configuration

### Claude Code

Create `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "knowtis": {
      "command": "node",
      "args": ["dist/apps/mcp/stdio.js"],
      "env": {
        "KNOWTIS_API_URL": "http://localhost:3333",
        "KNOWTIS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "knowtis": {
      "command": "node",
      "args": ["/absolute/path/to/knowtis/dist/apps/mcp/stdio.js"],
      "env": {
        "KNOWTIS_API_URL": "https://your-api.railway.app",
        "KNOWTIS_API_KEY": "knowtis_mcp_live_..."
      }
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "knowtis": {
      "command": "node",
      "args": ["/absolute/path/to/knowtis/dist/apps/mcp/stdio.js"],
      "env": {
        "KNOWTIS_API_URL": "http://localhost:3333",
        "KNOWTIS_API_KEY": "your-api-key-here"
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
      "command": "node",
      "args": ["/absolute/path/to/knowtis/dist/apps/mcp/stdio.js"],
      "env": {
        "KNOWTIS_API_URL": "http://localhost:3333",
        "KNOWTIS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> Claude Code uses `tsx` (no build needed). Other clients require building first: `pnpm nx build mcp`

## Available Tools

| Tool                | Description                                   | Parameters                                                            | Scope |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------- | ----- |
| `list-notes`        | List user's notes with optional search filter | `search?` (string), `limit?` (number, default 20)                     | read  |
| `get-note`          | Get the full content of a specific note       | `noteId` (UUID)                                                       | read  |
| `create-note`       | Create a new note                             | `title` (string), `content?` (string)                                 | write |
| `update-note`       | Update title or content of an existing note   | `noteId` (UUID), `title?` (string), `content?` (string)               | write |
| `delete-note`       | Permanently delete a note (irreversible)      | `noteId` (UUID)                                                       | write |
| `get-collaborators` | List who has access to a note                 | `noteId` (UUID)                                                       | read  |
| `share-note`        | Share a note with another user                | `noteId` (UUID), `userId` (UUID), `permission` ("viewer" or "editor") | share |

## Architecture

### Auth Flow

```
Client (Claude/Cursor/VS Code)
  │
  │  stdio with KNOWTIS_API_KEY env var
  ▼
MCP Server (apps/mcp)
  │
  │  POST /api/v1/auth/token-exchange { apiKey }
  ▼
Knowtis API (apps/api)
  │
  │  Returns { accessToken, expiresIn, scopes }
  ▼
MCP Server caches JWT
  │
  │  Bearer token on all API calls
  ▼
Notes/Sharing API endpoints
```

1. The AI client starts the MCP server via stdio, passing the API key as an environment variable
2. On the first tool call, the MCP server exchanges the API key for a short-lived JWT via `POST /api/v1/auth/token-exchange`
3. The JWT is cached in memory (with a 1-minute buffer before expiry)
4. All subsequent API calls use the cached JWT as a Bearer token
5. Scope enforcement: the API key's scopes determine which tools are available (read, write, share)

### Transports

- **Streamable HTTP** (`/mcp` endpoint) — For remote/server deployments. Stateless, each request creates a new transport.
- **stdio** (`dist/apps/mcp/stdio.js`) — For local client integrations. Used by Claude Code, Claude Desktop, Cursor, and VS Code.

## Development

```bash
# Run tests
pnpm nx test mcp

# Lint
pnpm nx lint mcp

# Build
pnpm nx build mcp

# Type check
pnpm typecheck
```

Source code is in `apps/mcp/src/`:

```
apps/mcp/src/
├── index.ts              # HTTP entry point (Hono + @hono/node-server)
├── stdio.ts              # stdio entry point
├── server.ts             # MCP server factory (registers tools)
├── transport.ts          # Hono app with /health and /mcp routes
├── config.ts             # Zod-validated configuration
├── auth/
│   ├── auth-service.ts   # API key → JWT exchange + caching
│   └── token-cache.ts    # In-memory token cache
├── api-client/
│   ├── client.ts         # Typed HTTP client for Knowtis API
│   ├── notes.api.ts      # Notes API methods
│   └── sharing.api.ts    # Sharing API methods
├── middleware/
│   └── logger.ts         # Structured logging
└── tools/
    ├── notes.tools.ts    # list-notes, get-note, create-note, update-note, delete-note
    └── sharing.tools.ts  # get-collaborators, share-note
```

## Deployment

### Railway

The MCP server can be deployed alongside the API on Railway. Required environment variables:

| Variable           | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| `API_INTERNAL_URL` | Internal Railway URL of the API service (e.g., `http://api.railway.internal:3333`) |
| `PORT`             | `3334` (or Railway's assigned port)                                                |
| `NODE_ENV`         | `production`                                                                       |

The health check endpoint `GET /health` can be used for Railway's health check configuration.

### Remote Clients

For remote deployments, clients connect via the Streamable HTTP transport at `https://your-mcp-server.railway.app/mcp` instead of using stdio. The API key must be passed in the request metadata.

For stdio-based clients (Claude Desktop, etc.), point the command to the deployed server's stdio entry or use a proxy that bridges stdio to the remote HTTP endpoint.
