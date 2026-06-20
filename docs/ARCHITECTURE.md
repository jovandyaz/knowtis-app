# Knowtis Architecture

This document provides a comprehensive overview of the Knowtis monorepo architecture, design principles, and technical standards.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Tech Stack](#tech-stack)
4. [Application Architecture](#application-architecture)
5. [Data Flow](#data-flow)
6. [Real-time Collaboration](#real-time-collaboration)
7. [Copilot Agent](#copilot-agent)
8. [Authentication Flow](#authentication-flow)
9. [Design Principles](#design-principles)
10. [Quality & Tooling](#quality--tooling)

---

## System Overview

Knowtis is a full-stack collaborative notes platform consisting of:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Notes App (React)                       │  │
│  │  • Rich text editing (Tiptap)                             │  │
│  │  • Real-time collaboration (Yjs)                          │  │
│  │  • Offline support (IndexedDB)                            │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       TRANSPORT LAYER                           │
│         HTTP/REST                    WebSocket (Hocuspocus)     │
├─────────────────────────────────────────────────────────────────┤
│                        SERVER LAYER                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    API (NestJS) v1                         │  │
│  │  • Authentication (JWT)                                    │  │
│  │  • Authorization (CASL)                                    │  │
│  │  • Notes CRUD                                              │  │
│  │  • AI Assistant (streaming)                                │  │
│  │  • Study Artifacts (flashcards, quizzes, summaries)        │  │
│  │  • Collaboration Service (Hocuspocus + Yjs)                │  │
│  │  • Feature Flags (DB-backed, Redis-cached)                 │  │
│  │  • MCP API key exchange                                    │  │
│  │  • Admin (user management, AI metrics)                     │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                              │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   PostgreSQL 16      │    │         Redis 7              │  │
│  │  • Users             │    │  • Session cache             │  │
│  │  • Notes             │    │  • Rate limiting (AI)        │  │
│  │  • Collaborators     │    │  • Feature flag cache (30s)  │  │
│  │  • Feature flags     │    │  • AI response cache         │  │
│  │  • Artifacts         │    │                              │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

This project uses **Nx** to organize code into a monorepo. This approach improves maintainability, encourages code reuse, and enforces clear boundaries.

### Apps vs Libs

The codebase is strictly divided into **Apps** (deployable units) and **Libs** (shared code):

```
knowtis/
├── apps/                    # Deployable applications
│   ├── api/                 # Backend (NestJS)
│   ├── mcp/                 # MCP server for AI assistants (Hono)
│   └── notes/               # Frontend (React)
│
├── libs/                    # App-specific libraries (not publishable)
│   ├── api-client/          # HTTP/WebSocket client
│   ├── authorization/       # CASL permission definitions
│   └── data-access/         # Domain logic & state
│       ├── artifacts/       # Study artifacts hooks & schemas
│       ├── feature-flags/   # Feature flags hooks & schemas
│       ├── mcp-keys/        # MCP API keys hooks & schemas
│       ├── notes/           # Notes hooks & store
│       └── users/           # Users hooks & schemas
│
└── packages/                # Shared packages (framework-light, reusable)
    ├── ai-gateway/          # Framework-free AI gateway core (chain, catalog, guard, tokens)
    ├── auth/                # Auth core (+ /server): types, value objects, token/crypto
    ├── auth-nestjs/         # NestJS auth adapter (handlers, guards, strategies)
    ├── auth-react/          # React auth integration (store, hooks, provider)
    ├── crdt/                # Yjs/CRDT helpers & shared types
    ├── design-system/       # UI components & design tokens (Storybook)
    ├── editor/              # Collaborative Tiptap + Yjs editor
    ├── editor-schema/       # Tiptap schema extensions (Mermaid, semantic nodes)
    ├── email/               # React Email templates (i18n)
    ├── email-nestjs/        # NestJS email module (Resend/Console adapters)
    ├── permissions/         # CASL-wrapped permission core
    ├── permissions-nestjs/  # NestJS permission guards & decorators
    ├── permissions-react/   # React permission hooks
    └── shared/              # Common utilities
        ├── hooks/           # Generic React hooks
        ├── i18n/            # Internationalization
        ├── types/           # Shared TypeScript types
        └── util/            # Utility functions
```

### Library Categories

| Category          | Path                                                              | Description                                                               |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **API Client**    | `libs/api-client`                                                 | HTTP client, WebSocket client, API types                                  |
| **Authorization** | `libs/authorization`                                              | CASL permission definitions (shared FE/BE)                                |
| **Data Access**   | `libs/data-access/*`                                              | Domain logic, Zustand stores, React Query hooks                           |
| **AI Gateway**    | `packages/ai-gateway`                                             | AI gateway core: fallback chain, pricing catalog, injection guard, tokens |
| **Auth**          | `packages/auth`, `auth-nestjs`, `auth-react`                      | Auth core + NestJS/React adapters (JWT, sessions, anon)                   |
| **Permissions**   | `packages/permissions`, `permissions-nestjs`, `permissions-react` | CASL core + NestJS/React adapters                                         |
| **Editor / CRDT** | `packages/editor`, `editor-schema`, `crdt`                        | Collaborative Tiptap + Yjs editor, schema extensions, CRDT helpers        |
| **Email**         | `packages/email`, `email-nestjs`                                  | React Email templates + NestJS delivery adapter                           |
| **Design System** | `packages/design-system`                                          | UI components, design tokens, styles                                      |
| **Shared**        | `packages/shared/*`                                               | Hooks, i18n, utilities, TypeScript types                                  |

### Dependency Rules

Libraries follow a strict dependency hierarchy:

```
Apps (can import everything below)
  ↓
Data Access (domain logic, can import API client & shared)
  ↓
API Client (can import shared only)
  ↓
Design System (can import shared only)
  ↓
Shared (no internal workspace dependencies)
```

---

## Tech Stack

### Frontend (Notes App)

| Technology      | Version | Purpose                 |
| --------------- | ------- | ----------------------- |
| React           | 19      | UI framework            |
| Vite            | 7       | Build tool & dev server |
| TanStack Router | 1.x     | Type-safe routing       |
| TanStack Query  | 5.x     | Server state management |
| Zustand         | 5       | Client state management |
| Tiptap          | 3       | Rich text editor        |
| Yjs             | 13      | CRDT for real-time sync |
| Tailwind CSS    | 4       | Styling                 |

### Backend (API)

| Technology      | Version | Purpose                    |
| --------------- | ------- | -------------------------- |
| NestJS          | 11      | Server framework           |
| Drizzle ORM     | 0.45    | Type-safe database ORM     |
| PostgreSQL      | 16      | Primary database           |
| Redis           | 7       | Caching & sessions         |
| Hocuspocus      | 4       | Yjs WebSocket sync server  |
| Passport        | 0.7     | Authentication middleware  |
| bcryptjs        | 3       | Password hashing           |
| class-validator | 0.14    | Request validation (DTO)   |
| neverthrow      | 8       | Result type error handling |
| Helmet          | 8       | Security headers           |
| Swagger/OpenAPI | 11      | API documentation          |

### Tooling

| Tool             | Purpose                            |
| ---------------- | ---------------------------------- |
| Nx               | Monorepo management & task running |
| TypeScript       | Type safety                        |
| ESLint           | Code linting (flat config)         |
| Prettier         | Code formatting                    |
| Vitest           | Unit & integration testing         |
| Lefthook         | Git hooks (lint, test, commit-msg) |
| Storybook        | Component documentation            |
| Style Dictionary | Design token generation            |

---

## Application Architecture

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         App Shell                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Providers (Context)                      │  │
│  │  • QueryClientProvider (React Query)                  │  │
│  │  • ThemeProvider (Dark/Light mode)                    │  │
│  │  • AuthProvider (Authentication state)                │  │
│  │  • YjsProvider (Collaboration documents)              │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     Router                             │  │
│  │  • TanStack Router with type-safe routes              │  │
│  │  • Protected route wrapper for auth                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Page Components                          │  │
│  │  • HomePage (notes dashboard)                         │  │
│  │  • LoginPage / RegisterPage                           │  │
│  │  • NoteEditorPage (rich text editing)                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Feature Components                        │  │
│  │  • NoteEditor, EditorToolbar                          │  │
│  │  • NoteList, NoteCard                                 │  │
│  │  • CollaboratorList                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Design System Components                      │  │
│  │  • Button, Input, Card, Dialog, etc.                  │  │
│  │  • Design tokens (colors, spacing, typography)        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Backend Architecture (Modular DDD)

The backend follows a **Modular Monolith** architecture where core domains (`auth`, `notes`, `ai`, `artifacts`) implement **DDD/Clean Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                      NestJS Application                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Controllers                         │  │
│  │  • AuthController (HTTP -> Command/Query)             │  │
│  │  • NotesController (HTTP -> Command/Query)            │  │
│  │  • AIController + AIGateway (HTTP + WebSocket)        │  │
│  │  • AgentGateway (copilot, WebSocket + HITL)           │  │
│  │  • ArtifactsController (study artifacts)              │  │
│  │  • AdminController (user mgmt, AI metrics)            │  │
│  │  • McpKeysController (MCP API key exchange)           │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Application Layer                      │  │
│  │  • Command Handlers (CreateNote, LoginUser)           │  │
│  │  • Query Handlers (GetNote, GetProfile)               │  │
│  │  • AI Orchestration (streaming, rate limiting)        │  │
│  │  • Artifact Generation (flashcards, quizzes, etc.)   │  │
│  │  • Authorization (CASL ability factory)               │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Domain Layer                         │  │
│  │  • Entities (User, Note)                              │  │
│  │  • Value Objects (Email, NoteTitle)                   │  │
│  │  • Ports (UserRepository, NoteRepository)             │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Infrastructure Layer                     │  │
│  │  • Adapters (DrizzleUserRepository)                   │  │
│  │  • Persistence (Drizzle ORM)                          │  │
│  │  • External Services (Redis, Crypto)                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Read Operations (Query)

```
User Action (view notes)
       ↓
Page Component
       ↓
useNotes() hook
       ↓
API Client (notesApi.getAll)
       ↓
HTTP GET /api/v1/notes
       ↓
NotesController.findAll()
       ↓
GetNotesHandler.execute() (Application)
       ↓
NoteRepository.findByOwner() (Domain Port)
       ↓
DrizzleNoteRepository (Infrastructure Adapter)
       ↓
Drizzle ORM → PostgreSQL
       ↓
Response mapped to DTO
```

### Write Operations (Command)

```
User Action (create note)
       ↓
Form Component
       ↓
useCreateNote() mutation
       ↓
HTTP POST /api/v1/notes
       ↓
NotesController.create()
       ↓
CreateNoteHandler.execute()
       ↓
NoteTitle.create() (Domain Validation)
       ↓
NoteRepository.create() (Domain Port)
       ↓
DrizzleNoteRepository (Infrastructure Adapter)
       ↓
PostgreSQL
       ↓
UI Update
```

---

## Real-time Collaboration

### CRDT Architecture

We use [Yjs](https://yjs.dev/) for conflict-free real-time collaboration:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User A    │    │   Server    │    │   User B    │
│             │    │             │    │             │
│  ┌───────┐  │    │ ┌─────────┐ │    │  ┌───────┐  │
│  │ Y.Doc │←───────→│ Gateway │←───────→│ Y.Doc │  │
│  └───────┘  │    │ └─────────┘ │    │  └───────┘  │
│      ↓      │    │             │    │      ↓      │
│  ┌───────┐  │    │             │    │  ┌───────┐  │
│  │Tiptap │  │    │             │    │  │Tiptap │  │
│  │Editor │  │    │             │    │  │Editor │  │
│  └───────┘  │    │             │    │  └───────┘  │
│      ↓      │    │             │    │      ↓      │
│  IndexedDB  │    │  PostgreSQL │    │  IndexedDB  │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Synchronization Flow

1. **User makes edit** → Tiptap updates Y.Doc
2. **Y.Doc generates update** → Binary diff (Uint8Array)
3. **Update sent via WebSocket** → collaboration:sync event
4. **Server broadcasts to room** → Other clients receive update
5. **Clients apply update** → Y.Doc merges automatically (CRDT)
6. **Tiptap re-renders** → UI shows combined edits

### Presence (Awareness)

Users see each other's cursors via Yjs Awareness:

```typescript
// Broadcast local state
provider.awareness.setLocalStateField('user', {
  name: 'John',
  color: '#ff0000',
  cursor: { from: 10, to: 15 },
});

// Receive others' state
provider.awareness.on('change', ({ added, updated, removed }) => {
  // Update collaborator display
});
```

---

## Copilot Agent

The **copilot** is a conversational, tool-using agent that lives in its own `agent` NestJS module — distinct from the `ai` module, which serves single-shot editor completions. It talks to the client over a dedicated Socket.io namespace (`/agent`) and shares the framework-free `@knowtis/ai-gateway` core (provider fallback chain, prompt-injection guard, token costing) with every other AI path.

### Agent loop

Each turn runs a bounded tool-calling loop (Vercel AI SDK) inside `run-agent-turn.handler.ts`. The model can call read tools (search/fetch notes, web) and propose write tools; the loop is capped by `AI_AGENT_MAX_STEPS`, `AI_AGENT_MAX_MS`, and `AI_AGENT_MAX_OUTPUT_TOKENS`. Tools are organized as flag-gated **tool groups** resolved per turn, so retrieval, web search, and write capabilities toggle independently.

### Server-authoritative & human-in-the-loop

The agent is **server-authoritative**: the client sends one new message plus a `conversationId`, never its own history. The server rebuilds the thread from Postgres each turn.

Mutations (create / update note) never execute directly. The model emits a **proposal**; the server parks it in Redis and pushes it to the client for **approval**. Only on `agent:approve` does the server commit the change and resume the turn — a strict human-in-the-loop (HITL) gate that an MCP-scoped token cannot bypass.

```
agent:turn ──▶ load thread ──▶ tool loop ──▶ propose mutation
                                                    │
client  ◀── agent:proposal ─────────────────────────┘
   │
   └─ agent:approve ──▶ commit ──▶ resume ──▶ agent:done
```

### Memory & retrieval layers

| Layer                      | Description                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Thread memory (A6a)**    | Per-conversation history in `conversations` / `conversation_messages`, reconstructed server-side every turn. Always on with `ai_enabled`.  |
| **Long-term memory (A6b)** | Durable, userId-scoped facts extracted from idle conversations by a cron and recalled per turn via pgvector. Flag `agent_longterm_memory`. |
| **Hybrid retrieval (A3)**  | The `searchNotes` tool fuses Postgres FTS with a pgvector KNN leg via Reciprocal Rank Fusion. Flag `agent_hybrid_retrieval`.               |
| **Web search (A4)**        | `webSearch` / `webFetch` tools behind an agnostic provider port (Tavily). Flag `agent_web_search`.                                         |

All retrieved content — notes, memories, and web results — is injected into the prompt as **DATA**, passed through the injection guard, and never treated as instructions.

See [AI Module → Conversation memory (A6a)](./AI.md#conversation-memory-a6a) and the surrounding sections for the full schema, feature flags, and environment variables.

### Model selection & billing (BYOK)

The copilot model is resolved per turn through a cascade — per-conversation override → user account default → system default — over a **curated** catalog. Users can also bring their own key (BYOK): provider keys are AES-256-GCM-encrypted at rest, injected per request, and a stored key unlocks that provider's models while billing the user directly (the daily budget is bypassed, RPM is still enforced). A BYOK turn skips the server fallback chain and redacts provider errors. Flag `agent_byok`.

See [AI Module → Copilot Model Selection](./AI.md#copilot-model-selection) and [Bring-your-own-key (BYOK)](./AI.md#bring-your-own-key-byok).

---

## Authentication Flow

### JWT Token Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. LOGIN                                                   │
│  ┌──────────┐  POST /api/v1/auth/login ┌──────────┐         │
│  │  Client  │ ─────────────────→ │  Server  │              │
│  │          │ ←───────────────── │          │              │
│  │          │   { accessToken,   │          │              │
│  │          │     refreshToken } │          │              │
│  └──────────┘                    └──────────┘              │
│                                                             │
│  2. API REQUESTS                                            │
│  ┌──────────┐  Authorization:    ┌──────────┐              │
│  │  Client  │  Bearer <token>    │  Server  │              │
│  │          │ ─────────────────→ │          │              │
│  │          │ ←───────────────── │  (JWT    │              │
│  │          │   Response         │   Guard) │              │
│  └──────────┘                    └──────────┘              │
│                                                             │
│  3. TOKEN REFRESH (when access token expires)               │
│  ┌──────────┐  POST /api/v1/auth/refresh ┌──────────┐      │
│  │  Client  │  { refreshToken }     │  Server  │             │
│  │          │ ─────────────────→  │          │             │
│  │          │ ←─────────────────  │          │             │
│  │          │   { accessToken,    │          │             │
│  │          │     refreshToken }  │          │             │
│  └──────────┘                     └──────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Token Management (Client)

The `@knowtis/api-client` handles token refresh automatically:

```typescript
// On 401 response:
1. Pause outgoing requests
2. Call POST /api/v1/auth/refresh
3. Update stored tokens
4. Retry failed request
5. Resume queue
```

---

## Design Principles

### SOLID Principles

| Principle                 | Application                                        |
| ------------------------- | -------------------------------------------------- |
| **Single Responsibility** | Each module/component has one reason to change     |
| **Open/Closed**           | Components extensible via props, not modification  |
| **Liskov Substitution**   | Subtypes (e.g., Button variants) are substitutable |
| **Interface Segregation** | Small, focused interfaces (hooks, props)           |
| **Dependency Inversion**  | Components depend on abstractions (hooks/stores)   |

### Additional Principles

- **DRY** - Logic extracted into shared libraries or hooks
- **KISS** - Simple, readable solutions over complex engineering
- **Composition over Inheritance** - UI built by composing small components
- **Colocation** - Related code lives together (component + test + styles)
- **Type Safety** - TypeScript strict mode, runtime validation with Zod

### Naming Conventions

| Type       | Convention                     | Example                   |
| ---------- | ------------------------------ | ------------------------- |
| Components | PascalCase                     | `NoteCard.tsx`            |
| Hooks      | camelCase with `use` prefix    | `useNotes.ts`             |
| Stores     | camelCase with `.store` suffix | `notes.store.ts`          |
| Utils      | camelCase                      | `formatDate.ts`           |
| Types      | PascalCase                     | `Note`, `CreateNoteInput` |
| Constants  | SCREAMING_SNAKE_CASE           | `MAX_TITLE_LENGTH`        |

---

## Quality & Tooling

### TypeScript Configuration

Strict mode is enabled for maximum type safety:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Linting & Formatting

- **ESLint** - Modern flat config with React and TypeScript rules
- **Prettier** - Consistent formatting with import sorting

### Testing Strategy

| Layer        | Focus                     | Tools                 |
| ------------ | ------------------------- | --------------------- |
| Unit         | Business logic, utilities | Vitest                |
| Component    | UI interaction, rendering | React Testing Library |
| Integration  | API endpoints, services   | Vitest + supertest    |
| E2E (future) | Full user flows           | Playwright            |

### Coverage Goals

- **Critical paths** (auth, notes CRUD): 80%+
- **Utilities & shared code**: 90%+
- **UI components**: Snapshot + interaction tests

### CI/CD Pipeline

The project uses GitHub Actions (`.github/workflows/ci.yml`):

| Stage     | Tool                   | Trigger                   |
| --------- | ---------------------- | ------------------------- |
| Lint      | ESLint                 | Push/PR to main, develop  |
| Typecheck | TypeScript `--noEmit`  | Push/PR to main, develop  |
| Test      | Vitest                 | Push/PR to main, develop  |
| Build     | Nx (api + notes)       | After lint/typecheck/test |
| Deploy    | Railway (`railway up`) | Push to main only         |

**Frontend**: Vercel auto-deploys on push (no CI gate).
**Backend**: Railway deploys via CI after all checks pass.

---

## Related Documentation

- [Root README](../README.md) - Quick start & scripts
- [API Documentation](../apps/api/README.md) - Backend details
- [API Architecture](../apps/api/ARCHITECTURE.md) - DDD patterns
- [Notes App Documentation](../apps/notes/README.md) - Frontend details
- [AI Module](./AI.md) - AI assistant & voice notes
- [MCP Server](./MCP.md) - MCP integration for AI assistants
- [Deployment Guide](./DEPLOYMENT.md) - Railway & Vercel deployment

---

<p align="center">
  <strong>Knowtis Architecture v1.3</strong><br/>
  Last updated: June 2026
</p>
