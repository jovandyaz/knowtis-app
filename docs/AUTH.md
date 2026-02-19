# Authentication System

## Overview

JWT-based auth with refresh token rotation, email verification, and password reset. Follows **DDD/Clean Architecture** (Ports & Adapters) with the Result pattern via `neverthrow`.

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Backend  | NestJS 11, Passport.js, JWT, bcryptjs                   |
| Database | PostgreSQL 16, Drizzle ORM                              |
| Frontend | React 19, TanStack Query, Zustand, react-hook-form, Zod |

| Token               | TTL        | Configurable via               |
| ------------------- | ---------- | ------------------------------ |
| Access token (JWT)  | 15 minutes | `JWT_EXPIRES_IN`               |
| Refresh token (JWT) | 7 days     | `JWT_REFRESH_EXPIRES_IN`       |
| Email verification  | 24 hours   | `VERIFICATION_TOKEN_EXPIRY_MS` |
| Password reset      | 1 hour     | `RESET_TOKEN_EXPIRY_MS`        |
| Session             | 7 days     | `SESSION_EXPIRY_MS`            |

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
| `EMAIL_SERVICE`                       | `EmailService`                     | `ConsoleEmailService`                     |
| `PASSWORD_RESET_TOKEN_REPOSITORY`     | `PasswordResetTokenRepository`     | `DrizzlePasswordResetTokenRepository`     |
| `EMAIL_VERIFICATION_TOKEN_REPOSITORY` | `EmailVerificationTokenRepository` | `DrizzleEmailVerificationTokenRepository` |

---

## Authentication Flows

### Register

`POST /auth/register` → validate email/password VOs → check uniqueness → hash password → create user → generate tokens → create session → send verification email (async) → `201 { user, tokens }`

### Login

`POST /auth/login` → Passport `LocalStrategy` → verify credentials → generate tokens → create session → `200 { user, tokens }`

### Token Refresh

`POST /auth/refresh` → hash incoming token → find session → check expiry → delete old session → generate new tokens → create new session → `200 { tokens }`

**Rotation:** Each refresh invalidates the previous token. Token reuse (replay attack) → **all user sessions invalidated**.

### Logout

`POST /auth/logout` → hash refresh token → delete session → `204`. Best-effort (returns 204 even if session not found).

### Email Verification

`Register` → verification email (async) → user clicks link → `POST /auth/verify-email` → hash token → validate expiry → mark email verified → delete all verification tokens.

**Resend:** `POST /auth/resend-verification` (authenticated) — deletes existing tokens, generates new one.

### Password Reset

`POST /auth/forgot-password` (always returns success, prevents email enumeration) → if user exists: generate token → send email → `POST /auth/reset-password` → validate token + expiry → hash new password → update user → **invalidate all sessions**.

---

## API Reference

All endpoints prefixed with `/api/v1/auth`. Swagger available at `/api/docs` in development.

### Public endpoints

| Endpoint                     | Body                        | Rate limit | Response                            | Errors                                                                               |
| ---------------------------- | --------------------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /auth/login`           | `email`, `password`         | 5/15min    | `200 { user, tokens }`              | `INVALID_CREDENTIALS`                                                                |
| `POST /auth/register`        | `email`, `name`, `password` | 3/15min    | `201 { user, tokens }`              | `INVALID_EMAIL`, `WEAK_PASSWORD`, `EMAIL_ALREADY_EXISTS`                             |
| `POST /auth/refresh`         | `refreshToken`              | 10/1min    | `200 { accessToken, refreshToken }` | `INVALID_REFRESH_TOKEN`, `TOKEN_REUSE_DETECTED`, `SESSION_EXPIRED`                   |
| `POST /auth/forgot-password` | `email`                     | 3/15min    | `200 { message }`                   | —                                                                                    |
| `POST /auth/reset-password`  | `token`, `newPassword`      | 5/15min    | `200 { message }`                   | `INVALID_RESET_TOKEN`, `RESET_TOKEN_EXPIRED`, `WEAK_PASSWORD`                        |
| `POST /auth/verify-email`    | `token`                     | 5/15min    | `200 { message }`                   | `INVALID_VERIFICATION_TOKEN`, `VERIFICATION_TOKEN_EXPIRED`, `EMAIL_ALREADY_VERIFIED` |
| `POST /auth/logout`          | `refreshToken`              | —          | `204`                               | —                                                                                    |

### Authenticated endpoints

Require `Authorization: Bearer <token>` header.

| Endpoint                         | Response          | Errors                   |
| -------------------------------- | ----------------- | ------------------------ |
| `GET /auth/me`                   | `200 { user }`    | `401`                    |
| `POST /auth/resend-verification` | `200 { message }` | `EMAIL_ALREADY_VERIFIED` |

### Error shape

```json
{
  "statusCode": 400,
  "error": "WEAK_PASSWORD",
  "message": "...",
  "timestamp": "...",
  "path": "..."
}
```

---

## Security

- **Passwords:** bcrypt (10 rounds). Min 8 chars, uppercase, number, special char. Rules shared between frontend and backend via `getPasswordChecks()` from `@jovandyaz/auth`.
- **Token storage:** Refresh tokens and email/reset tokens stored as **SHA-256 hashes** (never plaintext). Generated with `crypto.randomBytes(32)`.
- **Refresh token rotation:** Each refresh invalidates previous token. Reuse → all sessions invalidated.
- **Rate limiting:** All endpoints via `@nestjs/throttler` (per-IP). Exceeding → `429`.
- **Email enumeration:** `forgot-password` always returns success regardless of email existence.
- **Session management:** Password reset invalidates all sessions. Logout invalidates specific session. Metadata (user agent, IP) stored for audit.
- **Email service gate:** `ConsoleEmailService` throws if `NODE_ENV=production`. Implement `EmailService` port for production.

### Environment variables

| Variable                 | Required | Default                 | Description                          |
| ------------------------ | -------- | ----------------------- | ------------------------------------ |
| `JWT_SECRET`             | Yes      | —                       | Access token signing key             |
| `JWT_REFRESH_SECRET`     | Yes      | —                       | Refresh token signing key            |
| `JWT_EXPIRES_IN`         | No       | `15m`                   | Access token TTL                     |
| `JWT_REFRESH_EXPIRES_IN` | No       | `7d`                    | Refresh token TTL                    |
| `FRONTEND_URL`           | No       | `http://localhost:4200` | Base URL for email links             |
| `NODE_ENV`               | No       | `development`           | Blocks `ConsoleEmailService` in prod |

---

## Database Schema

Four tables: `users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`.

- **`users`** — `id` (uuid PK), `email` (unique), `name`, `avatar_url`, `provider` (default `'local'`), `provider_id`, `password_hash`, `email_verified_at`, timestamps
- **`sessions`** — `id` (uuid PK), `user_id` (FK), `refresh_token_hash`, `user_agent`, `ip_address`, `expires_at`, `created_at`
- **`email_verification_tokens`** / **`password_reset_tokens`** — `id` (uuid PK), `user_id` (FK), `token_hash`, `expires_at`, `created_at`

All FKs cascade on delete. Indexed on `user_id` and `token_hash`/`refresh_token_hash`.

> After schema changes, run `pnpm db:push`.

---

## Frontend Integration

- **`@jovandyaz/auth`** — Browser-safe types, errors, password validation
- **`@jovandyaz/auth-react`** — Store, hooks, provider, token storage, Zod schemas
- **`@knowtis/api-client`** — HTTP client with automatic 401 → token refresh

`@jovandyaz/auth-react` is decoupled from any HTTP client via the `AuthApiAdapter` interface. The adapter is implemented in `apps/notes/src/auth/auth-api-adapter.ts`.

Token storage: access token **in-memory only**, refresh token in **localStorage**. On rehydration, missing refresh token triggers auto-logout.

Automatic token refresh is handled by `HttpClient` in `@knowtis/api-client`: on 401 → refresh callback → retry request. Wired via `httpClient.setRefreshTokenCallback()` in the adapter.

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
