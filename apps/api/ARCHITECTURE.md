# Knowtis API Architecture

## Overview

The Knowtis API follows a modular NestJS architecture with **DDD (Domain-Driven Design)** patterns implemented in the core modules (`auth`, `notes`, `ai`, and `artifacts`).

## Tech Stack

| Component | Technology               | Version  |
| --------- | ------------------------ | -------- |
| Framework | NestJS                   | 11.x     |
| Database  | PostgreSQL + Drizzle ORM | 16       |
| Auth      | Passport + JWT           | -        |
| API Docs  | Swagger/OpenAPI          | 11.x     |
| Testing   | Vitest                   | 4.x      |
| Security  | Helmet + ThrottlerModule | 8.x, 6.x |

## Directory Structure

```
apps/api/src/
├── adapters/         # WebSocket adapters
├── app/              # Root module
├── config/           # Environment validation
├── core/             # Filters, interceptors, exceptions
├── database/         # Drizzle schema and module
└── modules/
    ├── admin/        # Admin dashboard & metrics (Service-based)
    ├── agent/        # Conversational copilot: tool-use, HITL, memory (DDD) ✅
    ├── ai/           # AI text assistant (DDD) ✅
    ├── artifacts/    # AI-generated study artifacts (DDD) ✅
    ├── auth/         # Authentication (DDD) ✅
    ├── authorization/# CASL-based role & permission guards (Service-based)
    ├── collaboration/# Real-time collaboration
    ├── feature-flags/# DB-backed feature flags with cache
    ├── health/       # Health checks
    ├── mcp/          # MCP API keys & token exchange (Service-based)
    ├── notes/        # Notes CRUD (DDD) ✅
    ├── observability/# Langfuse OpenTelemetry tracing (Service-based)
    ├── users/        # User management (Service-based)
    └── websocket/    # Socket.IO auth, concurrency & heartbeat utils (Service-based)
```

## Module Architecture

### DDD Modules (auth, notes, ai, artifacts)

The `auth`, `notes`, `ai`, and `artifacts` modules use **Clean Architecture** with Ports & Adapters:

```
module/
├── application/      # Use case handlers
│   ├── commands/     # Write operations
│   └── queries/      # Read operations
├── domain/           # Pure business logic
│   ├── entities/     # Domain entities
│   ├── errors/       # Domain-specific errors
│   ├── ports/        # Interfaces (contracts)
│   └── value-objects/# Immutable validation objects
├── infrastructure/   # External adapters
│   ├── persistence/  # Database adapters
│   └── security/     # Security adapters (auth only)
├── dto/              # Request/Response DTOs
└── module.ts         # NestJS DI wiring
```

### Example: Notes Module

The `notes` module illustrates the pattern: commands (`create`, `update`, `delete`, `share`, `revoke-access`), queries (`get-note`, `get-notes`, `get-collaborators`), value objects (`NoteTitle`, `NoteContent`, `PermissionLevel`), and a single infrastructure adapter (`DrizzleNoteRepository`).

## Data Flow

```
Request → Controller → Handler → Domain Logic → Port ← Adapter → Database
```

Example: Create note

1. `POST /api/notes` → `NotesController.create()`
2. Controller calls `CreateNoteHandler.execute()`
3. Handler validates with `NoteTitle.create()`, `NoteContent.create()`
4. Handler uses `NoteRepository` port (resolved to `DrizzleNoteRepository`)
5. Returns `Result<T, E>` → `unwrapOrThrow()` → HTTP Response

## Key Patterns

### 1. Result Pattern (neverthrow)

All domain operations return `Result<T, E>` instead of throwing:

```typescript
const result = NoteTitle.create(input);
if (result.isErr()) return err(result.error);
```

### 2. Ports & Adapters (Dependency Inversion)

```typescript
// Port (domain/ports/)
@Inject(NOTE_REPOSITORY) private readonly repo: NoteRepository

// Adapter (infrastructure/)
{ provide: NOTE_REPOSITORY, useClass: DrizzleNoteRepository }
```

### 3. Value Objects

Immutable objects encapsulating validation:

- `NoteTitle` - validates length (1-200 chars)
- `NoteContent` - validates content presence
- `PermissionLevel` - validates 'viewer' | 'editor'

### 4. Application Handlers

Orchestrate use cases with single responsibility:

- `CreateNoteHandler` - creates notes with validation
- `UpdateNoteHandler` - updates with access control (owner vs editor)
- `ShareNoteHandler` - manages permissions (owner only)

## Security

- **Helmet**: Security headers (CSP disabled in dev)
- **ThrottlerModule**: 60 requests/60s, spent per registered user (per IP for anonymous and unauthenticated callers)
- **JWT**: Access (15m) + Refresh (7d) tokens

## API Documentation

Swagger UI: `/api/docs` (development only)

## Health Checks

- `GET /api/health` - Memory health check
- `GET /api/health/ping` - Simple ping
