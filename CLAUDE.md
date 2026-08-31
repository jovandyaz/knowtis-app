# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowtis is a real-time collaborative notes platform built as an Nx monorepo with React frontend and NestJS backend. Key technologies: React 19, NestJS 11, PostgreSQL 16, Drizzle ORM, Yjs (CRDT), Socket.io, TanStack Router/Query, Zustand, Tiptap editor.

## Important Rules

- **Always use `pnpm`** instead of `npm` or `yarn` for package management
- **No backwards-compatibility hacks** — no re-exports from barrel files, no legacy shims, no "old key" comments. If something is renamed or moved, update all consumers. Clean breaks over compat layers.
- **Barrels and re-exports** — a package's root `index.ts` is its public API and the only barrel that belongs (Nx `enforce-module-boundaries` limits consumers to what that file exports): import `@knowtis/*` and `@jovandyaz/*` symbols from the package alias, never by deep path. Inside an app or package, import from the file that defines the symbol; don't add `index.ts` barrels, and if a change would extend one, replace it instead — point its consumers at the source files and delete it (NestJS: barrels breed circular dependencies between modules and providers; Vite: they defeat tree-shaking and slow the dev server). Never re-export a symbol that another package or folder owns.
- **Always consult official docs** — before implementing or configuring anything involving external tools, libraries, or services (Vercel, Railway, Nx, etc.), AND before debugging library-specific issues (auth flows, init APIs, error codes), fetch the latest official documentation using Context7 MCP, web search, or CLI help. Never assume behavior from memory alone.
- **Minimal comments** — default to no inline comments. Only write JSDoc on exported APIs, `TODO`/`FIXME` markers, or comments that explain a non-obvious WHY (hidden constraint, subtle invariant, framework quirk workaround). Never paraphrase code, never reference the current task/PR/fix in comments.

## Essential Commands

```bash
# Development
pnpm dev              # Start Notes frontend (localhost:4200)
pnpm dev:api          # Start API backend (localhost:3333)
pnpm dev:backoffice   # Start Backoffice frontend (localhost:4400)
pnpm dev:all          # Start Notes + Backoffice + API simultaneously

# Testing
pnpm test             # Run all tests (watch mode)
pnpm test:run         # Run tests once
nx test notes         # Test specific project
nx test api           # Test API project

# Code Quality
pnpm lint             # Lint all projects
pnpm lint:fix         # Fix auto-fixable issues
pnpm typecheck        # TypeScript type checking
pnpm format           # Format with Prettier

# Database (requires Docker)
pnpm docker:up        # Start PostgreSQL + Redis
pnpm db:generate      # Generate a migration from schema changes
pnpm db:migrate:run   # Apply migrations (source of truth; never db:push shared DBs)
pnpm db:studio        # Open Drizzle Studio GUI

# Build
pnpm build            # Build frontend
pnpm build:backoffice # Build backoffice
pnpm build:api        # Build backend

# Nx
pnpm graph            # Visualize dependency graph
pnpm affected:test    # Test only affected projects
nx run <project> <target>  # Run specific task
```

## Architecture

### Monorepo Structure

```
apps/
├── api/           # NestJS backend (modules: admin, agent, ai, artifacts, auth, authorization, collaboration, feature-flags, health, mcp, notes, observability, users, websocket)
├── backoffice/    # Admin frontend (Vite, TanStack Router)
├── mcp/           # MCP server for AI assistants (Hono, standalone)
└── notes/         # React frontend (Vite, TanStack Router)

libs/              # App-specific libraries
├── api-client/           # HTTP/WebSocket client for frontend
├── authorization/        # CASL permission definitions (shared FE/BE)
└── data-access/          # React Query hooks + Zod schemas per domain
    ├── admin/ ├── artifacts/ ├── feature-flags/ ├── mcp-keys/ ├── notes/ ├── oauth/ └── users/

packages/          # Shared packages (framework-light, reusable)
├── ai-gateway/           # Framework-free AI gateway core (injection guard, sanitizer, token estimator)
├── auth/ auth-react/ auth-nestjs/   # Auth core + per-framework adapters
├── crdt/                 # Yjs/CRDT helpers
├── design-system/        # Shared UI components + design tokens (Storybook)
├── editor/ editor-schema/ # Tiptap editor + schema
├── email/ email-nestjs/  # Email core + NestJS adapter
├── permissions/ permissions-react/ permissions-nestjs/
└── shared/
    ├── hooks/ ├── i18n/ ├── types/ └── util/
```

### Dependency Flow

Enforced by Nx tags (see Module Boundaries): `type:app → {type:ui, type:data-access} → type:util`. `api-client` is itself `type:data-access`, and `design-system` is `type:ui` (not part of the data-access chain). Libraries in `shared/` have no internal workspace dependencies, and `packages/ai-gateway` has zero workspace dependencies by design (extractable).

### Path Aliases

The workspace uses a dual-namespace convention (see `tsconfig.base.json` paths for the full list).

The 18 `@knowtis/*` aliases: `@knowtis/ai-gateway`, `@knowtis/api-client`, `@knowtis/authorization`, `@knowtis/crdt`, `@knowtis/data-access-admin`, `@knowtis/data-access-artifacts`, `@knowtis/data-access-feature-flags`, `@knowtis/data-access-mcp-keys`, `@knowtis/data-access-notes`, `@knowtis/data-access-oauth`, `@knowtis/data-access-users`, `@knowtis/design-system`, `@knowtis/editor`, `@knowtis/editor-schema`, `@knowtis/shared-hooks`, `@knowtis/shared-i18n`, `@knowtis/shared-types`, `@knowtis/shared-util`.

The auth/permissions/email packages publish under the `@jovandyaz/*` namespace and are imported that way: `@jovandyaz/auth` (+ `@jovandyaz/auth/server`), `@jovandyaz/auth-react`, `@jovandyaz/auth-nestjs`, `@jovandyaz/permissions-core`, `@jovandyaz/permissions-react`, `@jovandyaz/permissions-nestjs`, `@jovandyaz/email`, `@jovandyaz/email-nestjs`. There is no `@knowtis/auth`, `@knowtis/permissions`, or `@knowtis/email`.

## Nx Guidelines

- Always run tasks through `nx` (e.g., `nx run`, `nx run-many`, `nx affected`) instead of underlying tooling directly
- Use `nx graph` to understand workspace architecture
- Use `nx show project <name>` to analyze specific project structure
- Prefer `nx affected` commands to only build/test/lint changed projects

### Module Boundaries (enforced via ESLint)

Projects are tagged with `type:` and `scope:` tags:

- **type:app** - Applications (can depend on any library type)
- **type:ui** - UI components (can depend on type:ui and type:util; cannot reach into type:data-access or type:app)
- **type:data-access** - State/API access (can depend on type:util, type:data-access)
- **type:util** - Pure utilities (can only depend on type:util)

Scope constraints:

- **scope:shared** - Can be used by any project
- **scope:notes** - Can only depend on scope:shared or scope:notes
- **scope:api** - Can only depend on scope:shared or scope:api

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

Pipeline uses **Nx affected** to optimize builds and deploys:

1. **Single CI job**: `nx affected -t lint test build` — only impacted projects
2. **Typecheck**: `nx affected -t typecheck` — covers every project the change can type-impact (affected includes dependents)
3. **Conditional deploy**: Deploys frontend (Vercel) and API/MCP (Railway) when affected
4. **SHA detection**: `nrwl/nx-set-shas@v5` auto-detects comparison commits

### Vercel (Frontend)

CI-driven, not Vercel Git auto-deploy: `vercel.json` sets `"git": { "deploymentEnabled": false }`, and the `deploy-frontend` job in `ci.yml` (gated on `notes` being affected, `main` push only) runs `vercel pull/build/deploy --prebuilt --prod`.

### Railway (Backend)

Deploy via `.github/scripts/railway-deploy.sh` in CI (detached `railway up`, then polling the deployment to a terminal status), conditional on `api` being affected. Railway still evaluates `watchPatterns` against the uploaded snapshot; a no-match deployment becomes `SKIPPED`, so compare that state with Nx's affected set rather than treating it as deployment success.

### Testing affected locally

```bash
npx nx show projects --affected --base=main --head=HEAD        # See affected projects
npx nx show projects --affected --type app --base=main --head=HEAD  # Apps only
npx nx affected -t lint test build --base=main --head=HEAD      # Simulate CI
```

## Code Conventions

### Naming

- Components: PascalCase (`NoteCard.tsx`)
- Hooks: camelCase with `use` prefix (`useNotes.ts`)
- Stores: camelCase with `.store` suffix (`auth.store.ts`)
- Types: PascalCase (`Note`, `CreateNoteInput`)
- Constants: SCREAMING_SNAKE_CASE

### Commit Messages

Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

### Pull Requests

- **Stacked PRs are GitHub-native** (`gh extension install github/gh-stack`) — split multi-step features into a stack of small PRs instead of one large one. Open each PR against the branch below it, then adopt the chain with `gh stack link <bottom> … <top>`; or build it tracked from the start with `gh stack init` / `add` / `submit`. Merge bottom-up — `gh stack merge` lands a stack atomically, and after any merge GitHub rebases and retargets the layers above on its own; never rebase a stacked branch by hand afterwards.
- **Keep every PR under 100 changed files** — CodeRabbit refuses larger ones and the cap is not configurable.
- **CodeRabbit reviews every PR, stacked or not, but must be triggered**: comment `@coderabbitai full review`, then confirm inline comments exist — a green check with none is a skipped review. Address its feedback before requesting human review.
- Feature branches use a Conventional-style prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`, etc.

### Git Hooks (Lefthook)

- **pre-commit**: Runs ESLint + Prettier on staged files, TypeScript type checking
- **pre-push**: Runs affected tests
- **commit-msg**: Validates Conventional Commits format

## API Documentation

Swagger UI available in development at `/api/docs`

List endpoints paginate with the envelope `{ items, total, page, limit }` (defaults: `page` 1, `limit` 25; ceilings `MAX_PAGE` and `MAX_LIMIT` in `apps/api/src/core/pagination`). `GET /admin/users` is the canonical example.

## Environment Setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/notes/.env.example apps/notes/.env
pnpm docker:up
pnpm db:migrate:run   # Apply migrations to the local DB
```

> AI features require `ANTHROPIC_API_KEY` in `apps/api/.env` and the `ai_enabled` flag toggled on in the DB. Bring-your-own-key (BYOK) additionally needs `BYOK_ENCRYPTION_KEY` (32-byte base64) and the `agent_byok` flag. See [docs/AI.md](docs/AI.md).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
