# Authentication System

## Overview

JWT-based auth with refresh token rotation, email verification, and password reset. Follows **DDD/Clean Architecture** (Ports & Adapters) with the Result pattern via `neverthrow`.

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Backend  | NestJS 11, Passport.js, JWT, bcryptjs                   |
| Database | PostgreSQL 16, Drizzle ORM                              |
| Frontend | React 19, TanStack Query, Zustand, react-hook-form, Zod |

| Token               | TTL        | Source                                  |
| ------------------- | ---------- | --------------------------------------- |
| Access token (JWT)  | 15 minutes | env `JWT_EXPIRES_IN`                    |
| Refresh token (JWT) | 7 days     | env `JWT_REFRESH_EXPIRES_IN`            |
| Email verification  | 24 hours   | constant (`@jovandyaz/auth`, hardcoded) |
| Password reset      | 1 hour     | constant (`@jovandyaz/auth`, hardcoded) |
| Session             | 7 days     | constant (`@jovandyaz/auth`, hardcoded) |

> Only the JWT TTLs are env-configurable. The verification/reset/session windows are constants in [`packages/auth/src/lib/constants.ts`](../packages/auth/src/lib/constants.ts) (`VERIFICATION_TOKEN_EXPIRY_MS`, `RESET_TOKEN_EXPIRY_MS`, `SESSION_EXPIRY_MS`).

---

## Architecture

```
packages/
├── auth/                  # Core: types, errors, value objects, events, constants
├── auth-react/            # React: store, hooks, provider, token storage, schemas
└── auth-nestjs/           # NestJS: handlers, ports, guards, strategies, module

apps/api/src/modules/auth/
├── dto/                   # Request validation (class-validator)
└── infrastructure/        # Adapters: Drizzle repos, Bcrypt, JWT, email, logging
```

> Package details in [AUTH-PACKAGES.md](AUTH-PACKAGES.md).

**Dependency flow:**

```
Controller → Handlers (use cases) → Domain Ports ← Infrastructure (adapters)
```

Handlers depend on **port interfaces** (injected via NestJS DI with `Symbol` tokens). Infrastructure implements those ports.

| Token                                 | Interface                          | Implementation                            |
| ------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `USER_REPOSITORY`                     | `UserRepository`                   | `DrizzleUserRepository`                   |
| `SESSION_REPOSITORY`                  | `SessionRepository`                | `DrizzleSessionRepository`                |
| `PASSWORD_HASHER`                     | `PasswordHasher`                   | `BcryptPasswordHasher`                    |
| `TOKEN_SERVICE`                       | `TokenService`                     | `JwtTokenService`                         |
| `EMAIL_SERVICE`                       | `EmailService`                     | `AuthEmailService`                        |
| `PASSWORD_RESET_TOKEN_REPOSITORY`     | `PasswordResetTokenRepository`     | `DrizzlePasswordResetTokenRepository`     |
| `EMAIL_VERIFICATION_TOKEN_REPOSITORY` | `EmailVerificationTokenRepository` | `DrizzleEmailVerificationTokenRepository` |

> Email delivery goes through the [`@jovandyaz/email-nestjs`](../packages/email-nestjs) package: `AuthEmailService` renders templated, i18n messages via [`@jovandyaz/email`](../packages/email) and sends them with a provider selected by `EMAIL_PROVIDER` — `ResendSender` (`'resend'`) or `ConsoleSender` (`'console'`).

---

## Authentication Flows

### Register

`POST /auth/register` → validate email/password VOs → check uniqueness → hash password → create user → generate tokens → create session → send verification email (async) → `201 { user, tokens }`

### Login

`POST /auth/login` → Passport `LocalStrategy` → verify credentials → generate tokens → create session → `200 { user, tokens }`

### Token Refresh

`POST /auth/refresh` → read refresh token from HttpOnly cookie (`rid`) → verify + hash → find session → check expiry → mark session rotated → issue new tokens **in the same family** → set new cookie → `200 { accessToken }`

**Rotation & token-family theft detection:** Refresh tokens are grouped by a `familyId` (issued at login). Each refresh stamps the current session `rotatedAt` and issues a fresh token in the same family. Reusing an already-rotated (or missing) token **past a 30s grace window** (`REFRESH_TOKEN_GRACE_MS`) is treated as theft → only **that family** is revoked (`deleteByFamilyId`), never every session the user owns. The grace window lets concurrent tabs refresh simultaneously without a false-positive theft signal. Legacy tokens carrying no `familyId` (pre-rotation) are simply rejected; rotated sessions are pruned after the grace window.

### Logout

`POST /auth/logout` → read refresh token from HttpOnly cookie (`rid`) → hash token → delete session → clear cookie → `204`. Best-effort (returns 204 even if cookie/session not found).

### Email Verification

`Register` → verification email (async) → user clicks link → `POST /auth/verify-email` → hash token → validate expiry → mark email verified → delete all verification tokens.

**Resend:** `POST /auth/resend-verification` (authenticated) — deletes existing tokens, generates new one.

### Password Reset

`POST /auth/forgot-password` (always returns success, prevents email enumeration) → if user exists: generate token → send email → `POST /auth/reset-password` → validate token + expiry → hash new password → update user → **invalidate all sessions**.

### Anonymous Users

`POST /auth/anonymous` → mint an anonymous user (`is_anonymous = true`) → issue the standard access + refresh token pair (refresh in the `rid` cookie) → `201 { user, accessToken }`. Passing a still-valid anonymous token reuses the same identity instead of minting a new user (`AnonymousAuthService.createAnonymousSession`).

**Migration to a real account:** `login` and `register` accept optional `anonymousUserId` + `anonymousToken`. After authenticating, the anonymous token is verified as an identity proof (`verifyMigrationProof` — signature + claims + DB match, expiry ignored) and the anonymous user's data (notes, AI usage) is migrated via `DrizzleAnonymousDataMigrationRepository`. Migration failures are logged but never block login/registration.

**Cleanup:** `CleanupAnonymousTask` (`@Cron`, daily 03:00) prunes stale anonymous users.

---

## API Reference

All endpoints prefixed with `/api/v1/auth`. Swagger available at `/api/docs` in development.

`GET /auth/me` (authenticated, `JwtAuthGuard`) returns the current user profile (`{ user }`).

---

## Security

- **Passwords:** bcrypt (10 rounds). Min 8 chars, uppercase, number, special char. Rules shared between frontend and backend via `getPasswordChecks()` from `@jovandyaz/auth`.
- **Token storage:** Refresh tokens stored in **HttpOnly cookies** (`rid`, `SameSite=Lax`, `path=/api/v1/auth`, Secure in production) and as **SHA-256 hashes** in the database (never plaintext). `Lax` is sufficient because all auth routes are POST-only and Lax never attaches cookies to cross-site POST requests. Email/reset tokens also stored as hashes. All generated with `crypto.randomBytes(32)`.
- **Refresh token rotation:** Each refresh rotates the token within its family. Reuse past the grace window → the **token family** is revoked (not all user sessions). See [Token Refresh](#token-refresh).
- **Rate limiting:** All endpoints via `@nestjs/throttler` (per-IP). Exceeding → `429`.
- **Email enumeration:** `forgot-password` always returns success regardless of email existence.
- **Session management:** Password reset invalidates all sessions. Logout invalidates specific session. Metadata (user agent, IP) stored for audit.
- **Email service:** Delivery runs through `@jovandyaz/email-nestjs` and is selected by `EMAIL_PROVIDER`. **Resend** is the production provider (`ResendSender`, requires `RESEND_API_KEY`); the `console` provider (`ConsoleSender`) only logs emails and is for local development.

### Environment variables

| Variable                 | Required | Default                         | Description                                            |
| ------------------------ | -------- | ------------------------------- | ------------------------------------------------------ |
| `JWT_SECRET`             | Yes      | —                               | Access token signing key                               |
| `JWT_REFRESH_SECRET`     | Yes      | —                               | Refresh token signing key                              |
| `JWT_EXPIRES_IN`         | No       | `15m`                           | Access token TTL                                       |
| `JWT_REFRESH_EXPIRES_IN` | No       | `7d`                            | Refresh token TTL                                      |
| `FRONTEND_URL`           | No       | `http://localhost:4200`         | Base URL for email links                               |
| `EMAIL_PROVIDER`         | No       | `console`                       | Email sender: `resend` (prod) \| `console` (dev)       |
| `RESEND_API_KEY`         | Cond.    | —                               | Resend API key (required when `EMAIL_PROVIDER=resend`) |
| `EMAIL_FROM`             | No       | `Knowtis <noreply@knowtis.com>` | Default sender address                                 |
| `NODE_ENV`               | No       | `development`                   | Controls email service warnings                        |

---

## Database Schema

Four tables: `users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`.

- **`users`** — `id` (uuid PK), `email` (unique), `name`, `avatar_url`, `provider` (default `'local'`), `provider_id`, `password_hash`, `locale`, `is_anonymous` (default `false`), `role` (`user_role` enum: `'user'` | `'admin'`, default `'user'`), `email_verified_at`, timestamps
- **`sessions`** — `id` (uuid PK), `user_id` (FK), `family_id` (uuid, groups rotated tokens), `refresh_token_hash`, `rotated_at`, `user_agent`, `ip_address`, `expires_at`, `created_at`
- **`email_verification_tokens`** / **`password_reset_tokens`** — `id` (uuid PK), `user_id` (FK), `token_hash`, `expires_at`, `created_at`

All FKs cascade on delete. Indexed on `user_id` and `token_hash`/`refresh_token_hash`.

> After schema changes, run `pnpm db:generate && pnpm db:migrate:run` (never `db:push` against shared DBs — see [MIGRATIONS.md](MIGRATIONS.md)).

---

## Frontend Integration

- **`@jovandyaz/auth`** — Browser-safe types, errors, password validation
- **`@jovandyaz/auth-react`** — Store, hooks, provider, token storage, Zod schemas
- **`@knowtis/api-client`** — HTTP client with automatic 401 → token refresh

`@jovandyaz/auth-react` is decoupled from any HTTP client via the `AuthApiAdapter` interface. The adapter is implemented in `apps/notes/src/auth/auth-api-adapter.ts`.

Token storage: access token **in-memory only**, refresh token in **HttpOnly cookie** (set by the backend, not accessible from JS). On rehydration, the store triggers a silent refresh to check if the cookie is still valid.

Automatic token refresh is handled by `HttpClient` in `@knowtis/api-client`: on 401 → refresh callback (sends cookie via `credentials: 'include'`) → retry request. Wired via `httpClient.setRefreshTokenCallback()` in the adapter.

> Package details in [AUTH-PACKAGES.md](AUTH-PACKAGES.md).

| Page                 | Route                       |
| -------------------- | --------------------------- |
| `LoginPage`          | `/login`                    |
| `RegisterPage`       | `/register`                 |
| `ForgotPasswordPage` | `/forgot-password`          |
| `ResetPasswordPage`  | `/reset-password?token=...` |
| `VerifyEmailPage`    | `/verify-email?token=...`   |

---

## Domain Events

Auth operations emit events via NestJS `EventEmitter2`, logged by `AuthAuditListener`.

| Event                                                             | Emitted by                            |
| ----------------------------------------------------------------- | ------------------------------------- |
| `auth.register`                                                   | RegisterUserHandler                   |
| `auth.login` / `auth.login.failed`                                | LoginUserHandler                      |
| `auth.token.refresh`                                              | RefreshTokensHandler                  |
| `auth.logout`                                                     | LogoutUserHandler                     |
| `auth.password.reset.requested` / `auth.password.reset.completed` | ForgotPassword / ResetPasswordHandler |
