# Authentication System

## Overview

Knowtis uses a JWT-based authentication system with refresh token rotation, email verification, and password reset capabilities. The backend auth module follows **DDD/Clean Architecture** (Ports & Adapters) with the Result pattern via `neverthrow`.

**Stack:**

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Backend   | NestJS 11, Passport.js, JWT, bcryptjs                   |
| Database  | PostgreSQL 16, Drizzle ORM                              |
| Frontend  | React 19, TanStack Query, Zustand, react-hook-form, Zod |
| Transport | REST over HTTPS                                         |

**Token lifetimes:**

| Token               | TTL        | Configurable via                        |
| ------------------- | ---------- | --------------------------------------- |
| Access token (JWT)  | 15 minutes | `JWT_EXPIRES_IN` env var                |
| Refresh token (JWT) | 7 days     | `JWT_REFRESH_EXPIRES_IN` env var        |
| Email verification  | 24 hours   | `VERIFICATION_TOKEN_EXPIRY_MS` constant |
| Password reset      | 1 hour     | `RESET_TOKEN_EXPIRY_MS` constant        |
| Session             | 7 days     | `SESSION_EXPIRY_MS` constant            |

**Key design decisions:**

- Refresh tokens are stored as **SHA-256 hashes** in the database (never in plaintext)
- Passwords are hashed with **bcrypt (10 rounds)** via a dedicated `PasswordHasher` port
- All auth endpoints are **rate-limited** via `@nestjs/throttler` (per-IP by default)
- Domain errors use the **Result pattern** (`ok`/`err`) instead of exceptions
- Auth events are emitted for **audit logging** without coupling handlers to logging concerns
- Access/refresh tokens are **JWTs**; email verification and password reset tokens are **random 64-char hex strings**

---

## Architecture

The auth module follows a layered DDD structure:

```
modules/auth/
├── application/
│   └── handlers/          # Use cases (RegisterUser, LoginUser, etc.)
├── domain/
│   ├── auth.constants.ts  # Expiry durations
│   ├── errors/            # Domain error definitions
│   ├── events/            # Domain events (audit)
│   ├── hash-token.ts      # SHA-256 token hashing
│   ├── ports/             # Interfaces (repository, services)
│   └── value-objects/     # Email, Password, UserId
├── dto/                   # Request validation (class-validator)
├── guards/                # JwtAuthGuard, LocalAuthGuard
├── strategies/            # Passport strategies (JWT, Local)
├── decorators/            # @CurrentUser, @Public
└── infrastructure/
    ├── email/             # ConsoleEmailService (dev only)
    ├── http/              # Result-to-HTTP mapping
    ├── logging/           # AuthAuditListener
    ├── persistence/       # Drizzle repositories
    └── security/          # BcryptPasswordHasher, JwtTokenService
```

### Decorators

- **`@Public()`** — Marks an endpoint as publicly accessible (bypasses `JwtAuthGuard`). Without it, all endpoints require a valid JWT.
- **`@CurrentUser()`** — Parameter decorator that extracts the authenticated user from the request (populated by Passport after JWT validation).

### Dependency flow

```
Controller → Handlers (use cases) → Domain Ports ← Infrastructure (adapters)
```

Handlers depend only on **port interfaces** (injected via NestJS DI with `Symbol` tokens). Infrastructure adapters implement those ports. This allows swapping implementations without changing business logic.

### DI Token registry

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

```
Client                    API                         Database
  |--- POST /auth/register -->|                           |
  |                           |-- validate Email VO ----->|
  |                           |-- validate Password VO -->|
  |                           |-- check email exists ---->|
  |                           |-- hash password (bcrypt)->|
  |                           |-- create user ----------->|
  |                           |-- generate JWT tokens --->|
  |                           |-- create session -------->|
  |                           |-- send verification email (async, fire-and-forget)
  |<-- 201 { user, tokens } --|                           |
```

On registration:

1. Validates email format and password strength (domain value objects)
2. Checks email uniqueness
3. Hashes password with bcrypt
4. Creates user record
5. Generates access + refresh tokens
6. Creates a session (stores refresh token hash + metadata)
7. Sends verification email asynchronously (does not block registration)

### Login

```
Client                    API                         Database
  |--- POST /auth/login ----->|                           |
  |                           |-- LocalStrategy: validate credentials
  |                           |-- generate JWT tokens --->|
  |                           |-- create session -------->|
  |<-- 200 { user, tokens } --|                           |
```

Login uses Passport's `LocalStrategy`. The strategy delegates credential validation to `LoginUserHandler`, which:

1. Finds user by email
2. Verifies password via `PasswordHasher.verify()`
3. Creates a new session with the refresh token hash
4. Returns user data + tokens

### Token Refresh

```
Client                    API                         Database
  |--- POST /auth/refresh --->|                           |
  |                           |-- hash incoming token --->|
  |                           |-- find session by hash -->|
  |                           |-- check session expiry -->|
  |                           |-- delete old session ---->|
  |                           |-- generate new tokens --->|
  |                           |-- create new session ---->|
  |<-- 200 { tokens } -------|                           |
```

**Refresh token rotation:** Each refresh invalidates the previous token and issues a new pair. If a token is reused (replay attack), **all user sessions are invalidated** as a security measure.

### Logout

```
Client                    API                         Database
  |--- POST /auth/logout ---->|                           |
  |                           |-- hash refresh token ---->|
  |                           |-- find & delete session ->|
  |<-- 204 No Content -------|                           |
```

Logout is a best-effort operation. If the session is not found, the endpoint still returns 204.

---

## Email Verification

### Flow

```
Register → verification email sent (async) → user clicks link → POST /verify-email
```

1. During registration, a **random 32-byte token** is generated
2. The token is hashed (SHA-256) and stored in `email_verification_tokens`
3. The **plain token** is sent to the user's email as a verification link
4. When the user submits the token, the handler:
   - Hashes it and looks it up in the database
   - Checks expiration (24 hours)
   - Checks if already verified (returns `EMAIL_ALREADY_VERIFIED`)
   - Sets `emailVerifiedAt` on the user record
   - Deletes all verification tokens for the user

### Resend verification

`POST /auth/resend-verification` (requires authentication):

- Checks if the email is already verified
- Deletes existing tokens for the user
- Generates and sends a new verification token

**Token expiry:** 24 hours (`VERIFICATION_TOKEN_EXPIRY_MS`)

---

## Password Reset

### Flow

```
POST /forgot-password → reset email sent → user clicks link → POST /reset-password
```

1. User submits email to `POST /auth/forgot-password`
2. Handler **always returns success** (prevents email enumeration)
3. If user exists:
   - Deletes any existing reset tokens
   - Generates a random 32-byte token, hashes it (SHA-256), stores in `password_reset_tokens`
   - Sends reset email with the plain token
4. User submits token + new password to `POST /auth/reset-password`
5. Handler:
   - Validates password strength
   - Hashes token and looks it up
   - Checks expiration (1 hour)
   - Hashes new password and updates user record
   - Deletes all reset tokens for the user
   - **Invalidates all user sessions** (forces re-login everywhere)

**Token expiry:** 1 hour (`RESET_TOKEN_EXPIRY_MS`)

---

## API Reference

All endpoints are prefixed with `/api/v1/auth`.

### Public endpoints

#### `POST /auth/login`

Login with email and password.

| Field      | Type   | Required | Description   |
| ---------- | ------ | -------- | ------------- |
| `email`    | string | Yes      | User email    |
| `password` | string | Yes      | User password |

**Rate limit:** 5 requests per 15 minutes

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null
  },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `401 INVALID_CREDENTIALS`

---

#### `POST /auth/register`

Create a new user account.

| Field      | Type   | Required | Validation                                   |
| ---------- | ------ | -------- | -------------------------------------------- |
| `email`    | string | Yes      | Valid email format                           |
| `name`     | string | Yes      | Min 2 characters                             |
| `password` | string | Yes      | Min 8 chars, uppercase, number, special char |

**Rate limit:** 3 requests per 15 minutes

**Response (201):** Same shape as login response.

**Errors:** `400 INVALID_EMAIL`, `400 WEAK_PASSWORD`, `409 EMAIL_ALREADY_EXISTS`

---

#### `POST /auth/refresh`

Refresh an access token using a refresh token.

| Field          | Type   | Required |
| -------------- | ------ | -------- |
| `refreshToken` | string | Yes      |

**Rate limit:** 10 requests per minute

**Response (200):**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:** `401 INVALID_REFRESH_TOKEN`, `401 TOKEN_REUSE_DETECTED`, `401 SESSION_EXPIRED`

---

#### `POST /auth/forgot-password`

Request a password reset email. Always returns success (email enumeration prevention).

| Field   | Type   | Required |
| ------- | ------ | -------- |
| `email` | string | Yes      |

**Rate limit:** 3 requests per 15 minutes

**Response (200):**

```json
{ "message": "If the email exists, a reset link will be sent" }
```

---

#### `POST /auth/reset-password`

Reset password using a token from the reset email.

| Field         | Type   | Required | Validation                                   |
| ------------- | ------ | -------- | -------------------------------------------- |
| `token`       | string | Yes      | 64-char hex string                           |
| `newPassword` | string | Yes      | Min 8 chars, uppercase, number, special char |

**Rate limit:** 5 requests per 15 minutes

**Response (200):**

```json
{ "message": "Password has been reset successfully" }
```

**Errors:** `400 INVALID_RESET_TOKEN`, `400 RESET_TOKEN_EXPIRED`, `400 WEAK_PASSWORD`

---

#### `POST /auth/verify-email`

Verify email address using a token from the verification email.

| Field   | Type   | Required | Validation         |
| ------- | ------ | -------- | ------------------ |
| `token` | string | Yes      | 64-char hex string |

**Rate limit:** 5 requests per 15 minutes

**Response (200):**

```json
{ "message": "Email verified successfully" }
```

**Errors:** `400 INVALID_VERIFICATION_TOKEN`, `400 VERIFICATION_TOKEN_EXPIRED`, `409 EMAIL_ALREADY_VERIFIED`

---

#### `POST /auth/logout`

Logout and invalidate the session.

| Field          | Type   | Required |
| -------------- | ------ | -------- |
| `refreshToken` | string | Yes      |

**Response:** `204 No Content`

---

### Authenticated endpoints

These require a valid JWT in the `Authorization: Bearer <token>` header.

#### `GET /auth/me`

Get the current user's profile.

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null
  }
}
```

**Errors:** `401 Unauthorized`

---

#### `POST /auth/resend-verification`

Resend the email verification link. Requires authentication.

**Rate limit:** 3 requests per 15 minutes

**Response (200):**

```json
{ "message": "Verification email sent successfully" }
```

**Errors:** `409 EMAIL_ALREADY_VERIFIED`

---

### Error codes

All auth errors follow this response shape (set by the `GlobalExceptionFilter`):

```json
{
  "statusCode": 400,
  "error": "WEAK_PASSWORD",
  "message": "Password too weak: At least 8 characters",
  "timestamp": "2026-02-15T20:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

Rate-limited requests return `429 Too Many Requests` with the same shape.

| Code                         | HTTP Status | Description                                             |
| ---------------------------- | ----------- | ------------------------------------------------------- |
| `INVALID_EMAIL`              | 400         | Invalid email format                                    |
| `INVALID_PASSWORD`           | 400         | Password operation failed                               |
| `INVALID_USER_ID`            | 400         | Invalid user ID format                                  |
| `WEAK_PASSWORD`              | 400         | Password doesn't meet requirements                      |
| `INVALID_CREDENTIALS`        | 401         | Wrong email or password                                 |
| `INVALID_REFRESH_TOKEN`      | 401         | Refresh token not found or invalid                      |
| `TOKEN_REUSE_DETECTED`       | 401         | Refresh token replay detected, all sessions invalidated |
| `SESSION_NOT_FOUND`          | 401         | Session not found in database                           |
| `SESSION_EXPIRED`            | 401         | Session has expired                                     |
| `INVALID_RESET_TOKEN`        | 400         | Reset token not found or invalid                        |
| `RESET_TOKEN_EXPIRED`        | 400         | Reset token has expired                                 |
| `INVALID_VERIFICATION_TOKEN` | 400         | Verification token not found or invalid                 |
| `VERIFICATION_TOKEN_EXPIRED` | 400         | Verification token has expired                          |
| `EMAIL_ALREADY_EXISTS`       | 409         | Email already registered                                |
| `EMAIL_ALREADY_VERIFIED`     | 409         | Email is already verified                               |
| `EMAIL_SEND_FAILED`          | 500         | Failed to send email                                    |
| `USER_NOT_FOUND`             | 404         | User not found                                          |
| `INTERNAL_ERROR`             | 500         | Unexpected server error                                 |

---

## Security

### Password hashing

Passwords are hashed with **bcrypt** (10 salt rounds) via the `BcryptPasswordHasher` adapter. The auth module is the sole owner of password hashing -- `UsersService` only accepts pre-hashed passwords.

### Password requirements

Validated on both backend (domain `Password` value object) and frontend (Zod schema):

- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character (`!@#$%^&*()_+-=[]{};\':\"\\|,.<>/?`)

Requirements are defined in `@knowtis/shared-types` (`getPasswordChecks()`) and shared between frontend and backend.

### Token security

- **Refresh tokens** and **email/reset tokens** are stored as **SHA-256 hashes** -- the database never contains plaintext tokens
- Tokens are generated using `crypto.randomBytes(32)` (cryptographically secure)
- Email verification tokens expire after **24 hours**
- Password reset tokens expire after **1 hour**
- Sessions expire after **7 days**

### Refresh token rotation

Every token refresh **invalidates** the previous refresh token and creates a new session. If a previously-used refresh token is submitted (replay attack), the system invalidates **all sessions** for that user.

### Rate limiting

All auth endpoints are rate-limited via `@nestjs/throttler` (**per-IP** by default). Exceeding the limit returns `429 Too Many Requests`.

| Endpoint            | Limit | Window |
| ------------------- | ----- | ------ |
| Login               | 5     | 15 min |
| Register            | 3     | 15 min |
| Refresh             | 10    | 1 min  |
| Forgot password     | 3     | 15 min |
| Reset password      | 5     | 15 min |
| Verify email        | 5     | 15 min |
| Resend verification | 3     | 15 min |

### Email enumeration prevention

- `POST /forgot-password` always returns the same success response regardless of whether the email exists
- Error messages don't reveal whether an email is registered (except during registration, where `EMAIL_ALREADY_EXISTS` is necessary)

### Session management

- Password reset **invalidates all sessions** (forces re-login on all devices)
- Logout invalidates the specific session associated with the refresh token
- Session metadata (user agent, IP) is stored for audit purposes

### Email service environment gate

`ConsoleEmailService` (development) throws an error if `NODE_ENV=production`. To add a production email service, implement the `EmailService` interface (`domain/ports/email.service.ts`) and swap the `EMAIL_SERVICE` provider in `auth.module.ts`.

### Environment variables

| Variable                 | Required | Default                 | Description                                             |
| ------------------------ | -------- | ----------------------- | ------------------------------------------------------- |
| `JWT_SECRET`             | Yes      | —                       | Secret key for signing access tokens                    |
| `JWT_REFRESH_SECRET`     | Yes      | —                       | Secret key for signing refresh tokens                   |
| `JWT_EXPIRES_IN`         | No       | `15m`                   | Access token TTL                                        |
| `JWT_REFRESH_EXPIRES_IN` | No       | `7d`                    | Refresh token TTL                                       |
| `FRONTEND_URL`           | No       | `http://localhost:4200` | Base URL for email links                                |
| `NODE_ENV`               | No       | `development`           | Environment (`production` blocks `ConsoleEmailService`) |

---

## Database Schema

### `users`

| Column              | Type        | Constraints                 |
| ------------------- | ----------- | --------------------------- |
| `id`                | uuid        | PK, auto-generated          |
| `email`             | text        | NOT NULL, UNIQUE            |
| `name`              | text        | NOT NULL                    |
| `avatar_url`        | text        | nullable                    |
| `provider`          | text        | NOT NULL, default `'local'` |
| `provider_id`       | text        | nullable                    |
| `password_hash`     | text        | nullable                    |
| `email_verified_at` | timestamptz | nullable                    |
| `created_at`        | timestamptz | NOT NULL, default now       |
| `updated_at`        | timestamptz | NOT NULL, default now       |

**Indexes:** `users_email_idx`, `users_provider_provider_id_idx` (unique)

### `sessions`

| Column               | Type        | Constraints                           |
| -------------------- | ----------- | ------------------------------------- |
| `id`                 | uuid        | PK, auto-generated                    |
| `user_id`            | uuid        | NOT NULL, FK → users (cascade delete) |
| `refresh_token_hash` | text        | NOT NULL                              |
| `user_agent`         | text        | nullable                              |
| `ip_address`         | text        | nullable                              |
| `expires_at`         | timestamptz | NOT NULL                              |
| `created_at`         | timestamptz | NOT NULL, default now                 |

**Indexes:** `sessions_user_id_idx`, `sessions_refresh_token_hash_idx`

### `email_verification_tokens`

| Column       | Type        | Constraints                           |
| ------------ | ----------- | ------------------------------------- |
| `id`         | uuid        | PK, auto-generated                    |
| `user_id`    | uuid        | NOT NULL, FK → users (cascade delete) |
| `token_hash` | text        | NOT NULL                              |
| `expires_at` | timestamptz | NOT NULL                              |
| `created_at` | timestamptz | NOT NULL, default now                 |

**Indexes:** `email_verification_tokens_user_id_idx`, `email_verification_tokens_token_hash_idx`

### `password_reset_tokens`

| Column       | Type        | Constraints                           |
| ------------ | ----------- | ------------------------------------- |
| `id`         | uuid        | PK, auto-generated                    |
| `user_id`    | uuid        | NOT NULL, FK → users (cascade delete) |
| `token_hash` | text        | NOT NULL                              |
| `expires_at` | timestamptz | NOT NULL                              |
| `created_at` | timestamptz | NOT NULL, default now                 |

**Indexes:** `password_reset_tokens_user_id_idx`, `password_reset_tokens_token_hash_idx`

> **Note:** After adding or modifying schemas, run `pnpm db:push` to apply changes to the database.

---

## Frontend Integration

### Libraries

The frontend auth layer is split across two libraries:

- **`@knowtis/auth`** -- API client, Zustand store, React Query hooks, Zod schemas
- **`@knowtis/api-client`** -- HTTP client with automatic token refresh on 401 responses

### Auth store (`Zustand`)

The auth store (`libs/auth/src/react/auth.store.ts`) manages:

- `isAuthenticated` -- derived from token presence
- `user` -- current user data
- `handleAuthSuccess()` -- stores tokens + user after login/register
- `logout()` -- clears tokens and user state

Tokens are persisted in `tokenStorage` (from `@knowtis/api-client`) and automatically attached to requests.

### React Query hooks

| Hook                      | Action                       | Auth required            |
| ------------------------- | ---------------------------- | ------------------------ |
| `useLogin()`              | Login with email/password    | No                       |
| `useRegister()`           | Create new account           | No                       |
| `useLogout()`             | Logout and clear state       | No (sends refresh token) |
| `useProfile()`            | Fetch current user           | Yes                      |
| `useForgotPassword()`     | Request password reset       | No                       |
| `useResetPassword()`      | Reset password with token    | No                       |
| `useVerifyEmail()`        | Verify email with token      | No                       |
| `useResendVerification()` | Resend verification email    | Yes                      |
| `useRateLimitState()`     | Track rate limit state in UI | N/A                      |

### Zod validation schemas

Frontend forms use Zod schemas (`libs/auth/src/core/schemas/auth.schemas.ts`) for client-side validation:

- `loginSchema` -- email + password
- `registerSchema` -- name + email + password + confirmPassword
- `forgotPasswordSchema` -- email
- `resetPasswordSchema` -- password + confirmPassword

Password validation reuses `getPasswordChecks()` from `@knowtis/shared-types` to keep rules in sync between frontend and backend.

### Automatic token refresh

The `httpClient` in `@knowtis/api-client` intercepts 401 responses and attempts a token refresh via `authApi.refreshToken()`. If the refresh fails, the user is logged out (tokens cleared from storage, auth store reset). This is transparent to consumers.

The refresh callback is wired in `libs/auth/src/api/auth.api.ts` via `httpClient.setRefreshTokenCallback()` — no manual setup is needed by page components.

### Frontend pages

| Page                 | Route                       | Description                                     |
| -------------------- | --------------------------- | ----------------------------------------------- |
| `LoginPage`          | `/login`                    | Email/password login form                       |
| `RegisterPage`       | `/register`                 | Registration with password strength indicator   |
| `ForgotPasswordPage` | `/forgot-password`          | Email submission for password reset             |
| `ResetPasswordPage`  | `/reset-password?token=...` | New password form (token from email)            |
| `VerifyEmailPage`    | `/verify-email?token=...`   | Automatic email verification (token from email) |

---

## Domain Events

Auth operations emit domain events via NestJS `EventEmitter2`. The `AuthAuditListener` logs these for observability.

| Event                           | Emitted by            | Data                                    |
| ------------------------------- | --------------------- | --------------------------------------- |
| `auth.register`                 | RegisterUserHandler   | userId, email, ip, userAgent, timestamp |
| `auth.login`                    | LoginUserHandler      | userId, email, ip, userAgent, timestamp |
| `auth.login.failed`             | LoginUserHandler      | email, ip, userAgent, timestamp         |
| `auth.token.refresh`            | RefreshTokensHandler  | userId, timestamp                       |
| `auth.logout`                   | LogoutUserHandler     | userId, timestamp                       |
| `auth.password.reset.requested` | ForgotPasswordHandler | email, timestamp                        |
| `auth.password.reset.completed` | ResetPasswordHandler  | userId, timestamp                       |

Events are handled by `AuthAuditListener` which logs them at appropriate levels (`LOG` for success, `WARN` for failures). This decouples audit logging from business logic.

To subscribe to events in your own listener, use the `@OnEvent` decorator:

```typescript
@OnEvent('auth.login')
handleLogin(event: UserLoggedInEvent): void {
  // custom logic
}
```
