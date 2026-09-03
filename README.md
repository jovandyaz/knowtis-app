<p align="center">
  <a href="https://knowtis.app"><img src="apps/notes/public/knowtis-kw.svg" width="72" alt="Knowtis" /></a>
</p>

<h1 align="center">Knowtis</h1>

<p align="center">
  Collaborative notes with an AI that reads, edits, and studies alongside you.
</p>

<p align="center">
  <a href="https://github.com/jovandyaz/knowtis-app/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jovandyaz/knowtis-app/ci.yml?style=flat-square&label=ci&labelColor=1a1a1a" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square&labelColor=1a1a1a" alt="MIT license" /></a>
  <a href="https://knowtis.app"><img src="https://img.shields.io/badge/app-knowtis.app-8b5cf6?style=flat-square&labelColor=1a1a1a" alt="knowtis.app" /></a>
</p>

<br />

Knowtis is a local-first, real-time notes workspace where AI is a collaborator rather than a chat window. It edits with you inside the document, proposes changes you approve, and turns what you write into material you can study.

## Features

**Write.** A Tiptap editor with slash commands, ghost-text suggestions, and inline AI actions to rewrite, summarize, translate, or expand a selection. Voice notes are recorded and transcribed in place.

**Collaborate.** Yjs CRDT sync with live presence and remote cursors. Notes persist to IndexedDB, so editing works offline and reconciles when you reconnect.

**Study.** Flashcards, quizzes, summaries, and mind maps generated from your notes, with SM-2 spaced repetition to schedule reviews.

**Extend.** A conversational copilot that reads and edits notes with human-in-the-loop approval, per-turn reasoning effort, and bring-your-own-key billing across Anthropic, OpenAI, and Google. An MCP server exposes your notes to Claude Desktop, Cursor, and VS Code.

## Quick start

Requires Node.js 22, pnpm 10, and Docker.

```bash
git clone git@github.com:jovandyaz/knowtis-app.git
cd knowtis-app
pnpm setup      # installs deps, scaffolds .env files, starts Postgres + Redis, pushes the schema
pnpm dev:all    # API on :3333, Notes on :4200, Backoffice on :4400
```

AI features need an `ANTHROPIC_API_KEY` (or OpenAI / Google key) in `apps/api/.env`. The full walkthrough, including how email verification works locally and how to connect an MCP client, is in [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

## Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Frontend  | React 19, Vite, TanStack Router and Query, Tailwind CSS |
| Backend   | NestJS 11, Drizzle ORM, Socket.io                       |
| Data      | PostgreSQL 16, Redis 7                                  |
| Real-time | Yjs (CRDT), IndexedDB                                   |
| AI        | Vercel AI SDK, Anthropic, OpenAI, Google, MCP           |
| Tooling   | Nx 22, TypeScript 5.9, Vitest, pnpm                     |

## Repository layout

```
apps/
  api/            NestJS backend: auth, notes, collaboration, AI, copilot agent, MCP keys
  notes/          React frontend: editor, collaboration, study tools
  backoffice/     Admin surface: users, feature flags, AI config and metrics
  mcp/            Standalone MCP server (Hono)
libs/
  api-client/     Typed HTTP and WebSocket client
  data-access/    React Query hooks and Zod schemas, per domain
  authorization/  CASL permission definitions shared by frontend and backend
packages/
  ai-gateway/     Framework-free AI core: provider fallback, injection guard, token costing
  crdt/           Yjs helpers
  editor/         Tiptap editor and schema
  design-system/  UI components and design tokens
  auth/ email/ permissions/   Core packages with React and NestJS adapters
  shared/         Hooks, i18n, types, utilities
```

Dependency direction is enforced with Nx module boundaries: `app → ui / data-access → util`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [Local setup](docs/LOCAL_SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [AI module and copilot](docs/AI.md)
- [MCP server](docs/MCP.md)
- [Authentication](docs/AUTH.md) and [permissions](docs/PERMISSIONS.md)
- [Deployment](docs/DEPLOYMENT.md) on Railway and Vercel

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you start, and see [SECURITY.md](SECURITY.md) to report a vulnerability privately. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
