---
paths:
  - 'apps/api/**'
---

# NestJS Backend Rules

## Dependency Injection

- NEVER use `import type` for classes injected via constructor. NestJS uses runtime reflection (`emitDecoratorMetadata`) to resolve providers — `import type` is erased at compile time and breaks DI silently.
- USE `import type` only for interfaces, type aliases, and generic type parameters that are not injected.
- ESLint `consistent-type-imports` is disabled for `apps/api/**` to prevent auto-fix from breaking DI.

```typescript
// WRONG — breaks DI at runtime
import type { ConfigService } from '@nestjs/config';
// CORRECT — preserves runtime metadata
import { ConfigService } from '@nestjs/config';
```

## Module Structure

- Use Symbol-based injection tokens for ports: `export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');`
- Register providers in `@Module({ providers: [{ provide: SYMBOL, useClass: Implementation }] })`.
- Use `useExisting` to alias a provider to an already-registered instance (avoids duplicate instantiation).
- Export only what other modules need — keep internal services private.

## Guards and Decorators

- Apply guards via `@UseGuards()` at controller or method level: `JwtAuthGuard`, `PoliciesGuard`, `McpScopeGuard`, `AnonymousNoteLimitGuard`.
- Use custom decorators for metadata: `@RequirePermission('create', SUBJECTS.Note)`.
- Global guards (e.g., `ThrottlerGuard`) are registered in `AppModule` via `APP_GUARD`.

## Configuration

- Always use `ConfigService` (injected) to read environment variables. Never use `process.env` directly.
- Environment variables are validated at startup with Zod in `env.config.ts`. If a new env var is needed, add it to the Zod schema first.
- Type-safe access: `ConfigService<EnvConfig, true>` with `.get()` or `.getOrThrow()`.

## Logging

- Instantiate logger as class property: `private readonly logger = new Logger(ClassName.name);`
- Use structured levels: `this.logger.log()` for info, `this.logger.warn()` for recoverable issues, `this.logger.error()` for failures.
- Always include context in log messages: what operation failed, which entity, why.

## HTTP Exceptions

- Use NestJS built-in exception classes: `NotFoundException`, `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `ConflictException`.
- Never throw generic `Error` from controllers — it produces a 500 without useful information.

## DTOs and Validation

- All DTOs must use `class-validator` decorators (`@IsString()`, `@IsUUID()`, `@IsOptional()`, etc.).
- Never use `any` in controller method parameters — always type with a DTO class.
- Use `class-transformer` decorators (`@Type()`, `@Transform()`) for nested objects and type coercion.

## DDD: Domain Layer (`modules/**/domain/`)

- Value Objects: private constructor + static `create()` factory returning `Result<VO, DomainError>` (neverthrow). Must enforce invariants in the factory — no invalid state allowed.
- Domain entities must have ZERO infrastructure imports: no Drizzle, no `@nestjs/*`, no database drivers. Only stdlib, neverthrow, and domain types.
- Repository interfaces (ports) live here as TypeScript interfaces + Symbol tokens. Implementations live in `infrastructure/`.
- Domain errors are plain objects with `code` and `message` properties, created via factory functions (e.g., `NoteErrors.invalidTitle(reason)`).
- Domain events are immutable classes with readonly properties, `EVENT_NAME` static constant, and `occurredOn: Date`.

## DDD: Application Layer (`modules/**/application/`)

- Command/Query handlers are `@Injectable()` classes with a single `execute(input)` method.
- Handlers must be thin orchestrators: create Value Objects, call repository methods, return `Result`. No business logic — delegate to domain.
- One handler per command/query (Single Responsibility).
- Handlers must NOT access the database directly — always go through repository ports injected via Symbol tokens.
- Use cases must be transport-agnostic: no `Request`, `Response`, or Socket objects. Controllers adapt HTTP/WS to use case inputs.

## DDD: Infrastructure Layer (`modules/**/infrastructure/`)

- Repository implementations satisfy port interfaces and live in `persistence/` subdirectory.
- Drizzle ORM: always use the query builder (`db.select().from()`, `db.insert().values()`), never raw SQL strings.
- All mutations (insert, update, delete) must chain `.returning()` to get affected rows.
- Use `escapeLike()` helper for LIKE queries to prevent wildcard injection.
- Mappers between Drizzle row types and domain entities must be explicit functions — no implicit type coercion or `as` casts.
- Watch for N+1 query patterns: prefer joins over sequential queries in loops.
