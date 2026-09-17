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
# Setup (first run)
pnpm run setup        # .env files, pnpm install, Docker services, migrations ("run" needed: `setup` is a pnpm built-in)

# Development
pnpm dev              # Start Notes frontend (localhost:4200)
pnpm dev:api          # Start API backend (localhost:3333)
pnpm dev:backoffice   # Start Backoffice frontend (localhost:4400)
pnpm dev:mcp          # Start MCP server (localhost:3334)
pnpm dev:all          # Start Notes + Backoffice + API simultaneously
pnpm dev:stop         # Kill stale `nx serve` processes holding the Nx task lock

# Testing
pnpm test             # Run all tests (watch mode in a TTY; single run in CI/hooks)
pnpm test:run         # Run tests once
pnpm test:coverage    # Run tests with coverage
pnpm nx test notes    # Test specific project
pnpm nx test api      # Test API project

# Code Quality
pnpm lint             # Lint all projects
pnpm lint:fix         # Fix auto-fixable issues
pnpm typecheck        # TypeScript type checking
pnpm format           # Format with Prettier
pnpm ds:add <name>    # Vendor a shadcn/ui primitive into packages/design-system/src/components/ui/

# Database (requires Docker)
pnpm docker:up        # Start PostgreSQL + Redis
pnpm db:generate      # Generate a migration from schema changes
pnpm db:migrate:run   # Apply migrations (source of truth; never db:push shared DBs)
pnpm db:baseline      # Mark existing migrations as applied on a DB created with db:push
pnpm db:seed:admin    # Seed an admin user
pnpm db:studio        # Open Drizzle Studio GUI

# Build
pnpm build            # Build frontend
pnpm build:backoffice # Build backoffice
pnpm build:api        # Build backend
pnpm build:mcp        # Build MCP server

# Nx
pnpm graph            # Visualize dependency graph
pnpm affected:test    # Test only affected projects
pnpm nx run <project> <target>  # Run specific task
```

## Architecture

### Monorepo Structure

```
apps/       api (NestJS) · notes (React/Vite) · backoffice (React/Vite) · mcp (Hono, standalone)
libs/       api-client · authorization (CASL, shared FE/BE) · data-access/* (React Query + Zod per domain)
packages/   framework-light, reusable; core + per-framework adapters (auth, email, permissions)
```

`nx graph` and `nx show project <name>` are authoritative — prefer them over any list here.

### Dependency Flow

Enforced by Nx tags (see Module Boundaries): `type:app → {type:ui, type:data-access} → type:util`. `api-client` is itself `type:data-access`, and `design-system` is `type:ui` (not part of the data-access chain). Libraries in `shared/` have no internal workspace dependencies, and `packages/ai-gateway` has zero workspace dependencies by design (extractable).

### Path Aliases

Dual namespace — the full list lives in `tsconfig.base.json` paths:

- `@knowtis/*` — everything in `libs/` and most of `packages/`.
- `@jovandyaz/*` — the auth, permissions and email packages (`@jovandyaz/auth` + `@jovandyaz/auth/server`, `-react`, `-nestjs`; `@jovandyaz/permissions-core`, `-react`, `-nestjs`; `@jovandyaz/email`, `-nestjs`).

**There is no `@knowtis/auth`, `@knowtis/permissions`, or `@knowtis/email`** — those three are `@jovandyaz/*` only.

## Module Boundaries (enforced via ESLint)

Projects are tagged with `type:` and `scope:` tags:

- **type:app** - Applications (can depend on any library type)
- **type:ui** - UI components (can depend on type:ui and type:util; cannot reach into type:data-access or type:app)
- **type:data-access** - State/API access (can depend on type:util, type:data-access)
- **type:util** - Pure utilities (can only depend on type:util)

Scope constraints:

- **scope:shared** - Can be used by any project
- **scope:notes** - Can only depend on scope:shared or scope:notes
- **scope:api** - Can only depend on scope:shared or scope:api
- **scope:backoffice** - Can only depend on scope:shared or scope:backoffice

## Code Conventions

### Naming

- Components: PascalCase (`NoteCard.tsx`)
- Hooks: camelCase with `use` prefix (`useNotes.ts`)
- Stores: camelCase with `.store` suffix (`auth.store.ts`)
- Types: PascalCase (`Note`, `CreateNoteInput`)
- Constants: SCREAMING_SNAKE_CASE

### Commit Messages

Follow Conventional Commits. Types accepted by the commit-msg hook: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert` (optional scope, e.g. `feat(auth): ...`).

### Pull Requests

- **Stacked PRs are GitHub-native** (`gh extension install github/gh-stack`) — split multi-step features into a stack of small PRs instead of one large one. Open each PR against the branch below it, then adopt the chain with `gh stack link <bottom> … <top>`; or build it tracked from the start with `gh stack init` / `add` / `submit`. Merge bottom-up — `gh stack merge` lands a stack atomically, and after any merge GitHub rebases and retargets the layers above on its own; never rebase a stacked branch by hand afterwards.
- **Keep every PR under 100 changed files** — CodeRabbit refuses larger ones and the cap is not configurable.
- **CodeRabbit reviews every PR, stacked or not, but must be triggered**: `.coderabbit.yaml` enables `auto_review` for `main` and Conventional-prefix base branches, but on this OSS plan CodeRabbit reports "Review skipped: manual review required" and does nothing until someone comments `@coderabbitai full review`. Trigger it, then confirm inline comments exist — a green check with none is a skipped review. Address its feedback before requesting human review.
- Feature branches use a Conventional-style prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`, etc.

### Git Hooks (Lefthook)

- **pre-commit**: ESLint + Prettier on staged `*.ts`/`*.tsx` (Prettier also on staged json/md/yaml), `nx affected -t typecheck --base=origin/main` (every `typecheck` target runs `tools/typecheck-project.sh {projectRoot}` from the workspace root, so the hook also works in linked worktrees where git exports `GIT_DIR`), and `check-migrations` (when schema files under `apps/api/src/database/schema/` are staged, runs `nx db:generate api` and stages `apps/api/drizzle/`)
- **pre-push**: `nx affected -t test --base=origin/main`
- **commit-msg**: Validates Conventional Commits format

## API Documentation

Swagger UI available in development at `/api/docs`

List endpoints paginate with the envelope `{ items, total, page, limit }` (defaults: `page` 1, `limit` 25; ceilings `MAX_PAGE` and `MAX_LIMIT` in `apps/api/src/core/pagination`). `GET /admin/users` is the canonical example.

## Environment Setup

```bash
pnpm run setup   # scaffolds apps/{api,notes,mcp}/.env, pnpm install, docker compose up, pnpm db:migrate:run
```

`setup` is a pnpm built-in, so the `run` is required. Full walkthrough: [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

> AI features require `OPENROUTER_API_KEY` in `apps/api/.env` (the default models are OpenRouter-hosted; Anthropic/OpenAI/Google keys are optional) and the `ai_enabled` flag toggled on in the DB. Bring-your-own-key (BYOK) additionally needs `BYOK_ENCRYPTION_KEY` (32-byte base64) and the `agent_byok` flag. See [docs/AI.md](docs/AI.md).

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
