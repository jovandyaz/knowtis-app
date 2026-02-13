# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowtis is a real-time collaborative notes platform built as an Nx monorepo with React frontend and NestJS backend. Key technologies: React 19, NestJS 11, PostgreSQL 16, Drizzle ORM, Yjs (CRDT), Socket.io, TanStack Router/Query, Zustand, Tiptap editor.

## Important Rules

- **Always use `pnpm`** instead of `npm` or `yarn` for package management

## Essential Commands

```bash
# Development
pnpm dev              # Start Notes frontend (localhost:4200)
pnpm dev:api          # Start API backend (localhost:3333)
pnpm dev:all          # Start both apps simultaneously

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
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Drizzle Studio GUI

# Build
pnpm build            # Build frontend
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
├── api/           # NestJS backend (modules: auth, notes, users, collaboration)
└── notes/         # React frontend (Vite, TanStack Router)

libs/
├── api-client/           # HTTP/WebSocket client for frontend
├── auth/                 # Auth API client, Zustand store + hooks
├── data-access/
│   └── notes/            # Notes React Query hooks + Zod schemas
├── design-system/        # Shared UI components + design tokens (Storybook)
└── shared/
    ├── hooks/            # Generic React hooks (useDebounce)
    ├── types/            # Shared TypeScript types
    └── util/             # Utility functions (logger, ID generator)
```

### Dependency Flow

Apps → data-access → api-client → shared. Libraries in `shared/` have no internal workspace dependencies.

### Path Aliases

Use `@knowtis/*` imports: `@knowtis/api-client`, `@knowtis/auth`, `@knowtis/data-access-notes`, `@knowtis/design-system`, `@knowtis/shared-hooks`, `@knowtis/shared-types`, `@knowtis/shared-util`

## Nx Guidelines

- Always run tasks through `nx` (e.g., `nx run`, `nx run-many`, `nx affected`) instead of underlying tooling directly
- Use `nx graph` to understand workspace architecture
- Use `nx show project <name>` to analyze specific project structure
- Prefer `nx affected` commands to only build/test/lint changed projects

### Module Boundaries (enforced via ESLint)

Projects are tagged with `type:` and `scope:` tags:

- **type:app** - Applications (can depend on any library type)
- **type:ui** - UI components (can only depend on type:util)
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
2. **Typecheck global**: `tsc --noEmit` on entire workspace
3. **Conditional deploy**: Only deploys API to Railway if `api` is affected
4. **SHA detection**: `nrwl/nx-set-shas@v4` auto-detects comparison commits

### Vercel (Frontend)

Auto-deploys on push to `main`, but uses `tools/vercel-ignore.sh notes` as Ignored Build Step to skip builds when `notes` is unaffected. Configured in Vercel Dashboard > Project Settings > Git > Ignored Build Step.

### Railway (Backend)

Deploy via `railway up` in CI, conditional on `api` being affected. The `watchPatterns` in `railway.toml` do NOT apply because the deploy is CI-driven, not via Railway's GitHub integration.

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

### Git Hooks (Lefthook)

- **pre-commit**: Runs ESLint + Prettier on staged files, TypeScript type checking
- **pre-push**: Runs affected tests
- **commit-msg**: Validates Conventional Commits format

### TypeScript Style

- Use `import type` for type-only imports
- Prefer `interface` over `type` for object shapes
- Use `const` by default, never `var`
- Always use curly braces for control structures

### NestJS DI Rule

In the backend, **never use `import type`** for classes that are injected via NestJS DI. NestJS needs runtime metadata from these imports. See `.agent/workflows/nestjs-di-rules.md`.

## Real-time Collaboration

The collaboration system uses Yjs (CRDT) for conflict-free sync:

1. User edits in Tiptap → Y.Doc updates
2. Y.Doc generates binary diff
3. Diff sent via Socket.io to collaboration gateway
4. Server broadcasts to room members
5. Clients apply update, Tiptap re-renders

Presence/awareness handled through Yjs Awareness API.

## Authentication

JWT-based with refresh tokens. The `@knowtis/api-client` handles token refresh automatically on 401 responses.

## Backend Modules

- **auth** - JWT authentication with DDD/Clean Architecture (Ports & Adapters, Value Objects, Result pattern via neverthrow)
- **notes** - Notes CRUD with DDD/Clean Architecture, sharing/permissions
- **collaboration** - WebSocket gateway (Socket.io) for Yjs real-time sync
- **users** - User management (service-based)
- **health** - Health check endpoints (`/api/v1/health/ping`, `/api/v1/health/ready`)
- **feature-flags** - Env-based feature flag service with guard

## API Documentation

Swagger UI available in development at `/api/docs`

## Environment Setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/notes/.env.example apps/notes/.env
pnpm docker:up
pnpm db:push
```
