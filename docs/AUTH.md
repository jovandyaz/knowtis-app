# Authentication System

## Overview

JWT-based auth with refresh token rotation, email verification, and password reset. Follows **DDD/Clean Architecture** (Ports & Adapters) with the Result pattern via `neverthrow`.

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Backend  | NestJS 11, Passport.js, JWT, bcryptjs                   |
| Database | PostgreSQL 16, Drizzle ORM                              |
| Frontend | React 19, TanStack Query, Zustand, react-hook-form, Zod |

| Token                     | TTL        | Source                                  |
| ------------------------- | ---------- | --------------------------------------- |
| Access token (JWT)        | 15 minutes | env `JWT_EXPIRES_IN`                    |
| Refresh token (JWT)       | 7 days     | env `JWT_REFRESH_EXPIRES_IN`            |
| Email verification (link) | 24 hours   | constant (`@jovandyaz/auth`, hardcoded) |
| Email verification (code) | 15 minutes | constant (`@jovandyaz/auth`, hardcoded) |
| Password reset            | 1 hour     | constant (`@jovandyaz/auth`, hardcoded) |
| Session                   | 7 days     | constant (`@jovandyaz/auth`, hardcoded) |

> Only the JWT TTLs are env-configurable. The verification/reset/session windows are constants in [`packages/auth/src/lib/constants.ts`](../packages/auth/src/lib/constants.ts) (`VERIFICATION_TOKEN_EXPIRY_MS`, `VERIFICATION_CODE_EXPIRY_MS`, `RESET_TOKEN_EXPIRY_MS`, `SESSION_EXPIRY_MS`) — alongside the code's attempt cap (`VERIFICATION_CODE_MAX_ATTEMPTS`, 5) and resend cooldown (`VERIFICATION_RESEND_COOLDOWN_MS`, 60 seconds).

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

Registering emails both a link and a 6-digit code, stored as one row hashed with the server-side `TOKEN_HASH_KEY`.

**Link (public):** `POST /auth/verify-email` → hash token → validate expiry (24h) → mark email verified → delete the verification rows → revoke every session.

**Code (authenticated):** `POST /auth/verify-email/code` → count the attempt → compare in constant time → validate expiry (15 min) → mark email verified → delete the verification rows → revoke every session **except the caller's own family**. Capped at `VERIFICATION_CODE_MAX_ATTEMPTS` (5) guesses; the spent row is kept so the cap cannot be reset by resending.

Every path that can verify an address emits `AuthEventName.EMAIL_VERIFIED`, carrying the `source` that did it — `code`, `link` or `password_reset` — so the funnel can tell which one moved the rate.

**Resend:** `POST /auth/resend-verification` (authenticated) — refuses within `VERIFICATION_RESEND_COOLDOWN_MS` (1 min) of the current row, otherwise replaces it and emails a fresh link and code.

Three refusals share the `429`: the per-code cooldown (`code: RESEND_COOLDOWN`), the attempt cap (`code: TOO_MANY_VERIFICATION_ATTEMPTS`) and the endpoint throttle — 10 per 15 minutes on the code check, 3 on the resend — which is the only one carrying no code at all. All three answer with `Retry-After` in RFC 9110 delta-seconds, never an HTTP-date. The two auth refusals round up and floor at `1`, and quote the wait actually left rather than the fixed window — a cooldown refused 55s into its minute says `5`. The attempt cap quotes the wait until a _resend_ becomes possible, since a new code is the only way out of a spent budget. The value is not duplicated into the body: the header is authoritative, and `buildCorsOptions` lists it in `exposedHeaders` because CORS otherwise hides every non-safelisted response header from a cross-origin frontend.

`HttpClient` parses it into `ApiClientError.retryAfterMs` on every failed response, not only these three. Only the delta-seconds form is honoured: resolving an HTTP-date needs the client clock, and a clock running behind would hold an action back far longer than the server asked. Missing, unusable or already-elapsed reads as no guidance, never `NaN`. `useResendCooldown` counts down whatever the cooldown refusal named and falls back to `VERIFICATION_RESEND_COOLDOWN_MS` when it named nothing, and shows no notice beside it — the button already names the wait, so anything else would contradict it; the attempt cap holds the resend for the wait it quoted; the throttle still withdraws the resend rather than counting down, because its wait is minutes rather than seconds. No single test spans server exposure and browser read — jsdom's fetch has no CORS layer — so `cors-origins.spec.ts` pins the exposure and `retry-after.test.ts` pins the parse.

On the client, `verifyErrorKey` in `useVerifyEmailCodeForm` gives each refusal its own copy: a wrong code, a spent attempt budget (quoting the resend wait), and — because the endpoint throttle carries no `code` — any bare `429` reads as `verifyEmail.codeThrottled` rather than a generic failure. A resend answered `409 EMAIL_ALREADY_VERIFIED` says so and withdraws the button.

### Verifying from the app

- **Registration** ends on `VerifyCodeStep`: the code field, the resend held for the cooldown that just started, and _Skip for now_. Verification is never forced at sign-up; the account is nudged and, once the gate is on, refused at the point of need.
- **`VerifyEmailBanner`** sits in the app shell for every signed-in, non-anonymous account whose profile reports `emailVerifiedAt: null`, whatever the state of `email_verification_gate` — nudging precedes enforcing, so accounts verify before the flag flips (see [PERMISSIONS.md](PERMISSIONS.md#verified-identity-gate)). Once the flag is on the copy names what verification unlocks. Dismissal is remembered per identity in `sessionStorage`.
- **`VerifyEmailDialog`** is mounted once in `_app` and driven by `verify-email.store`. The banner, every gated refusal (`useVerifyEmailGate().handleError`) and the copilot's `AGENT_EMAIL_NOT_VERIFIED` open it in place, so the user never leaves what they were doing. Its resend starts unheld because no code was just sent. A successful code returns the mutation only after the profile has been refetched, so the banner is gone by the time the dialog closes.
- **The link while signed in.** Redeeming the link revokes every session of its owner, including the one clicking it, so `guardVerifyEmailRoute` (the `/verify-email` `beforeLoad`) redirects a signed-in account to the dashboard and opens the dialog with an explanation instead of redeeming. It lands on `ROUTES.DASHBOARD`, not `/`, because the app root creates a fresh note whose editor would take the focus the dialog needs. An account that is already verified is sent to the dashboard with no dialog. A session that turns out dead during `_app` load closes any pending dialog before redirecting to login, so the intent never greets the next account on that tab.
- **`VerifyEmailPage`** serves signed-out and anonymous visitors: it redeems the token, scrubs it from the URL with a `replace` navigation, maps `400/404` to "invalid or expired", `409` to "already verified" and a bare `429` to the throttled copy, and offers a resend only to a signed-in, non-anonymous visitor.

### Password Reset

`POST /auth/forgot-password` (always returns success, prevents email enumeration) → if user exists: generate token → send email → `POST /auth/reset-password` → validate token + expiry → hash new password → update user → **invalidate all sessions**.

A completed reset also marks an unverified email as verified — reading the reset link proves inbox ownership — and emits `EMAIL_VERIFIED` with `source: 'password_reset'`.

### Anonymous Users

`POST /auth/anonymous` → mint an anonymous user (`is_anonymous = true`) → issue the standard access + refresh token pair (refresh in the `rid` cookie) → `201 { user, accessToken }`. Passing a still-valid anonymous token reuses the same identity instead of minting a new user (`AnonymousAuthService.createAnonymousSession`).

**Migration to a real account:** `login` and `register` accept optional `anonymousUserId` + `anonymousToken`. After authenticating, the anonymous token is verified as an identity proof (`verifyMigrationProof` — signature + claims + DB match, expiry ignored) and the anonymous user's data (notes, AI usage) is migrated via `DrizzleAnonymousDataMigrationRepository`. Migration failures are logged but never block login/registration.

**Cleanup:** `AuthCleanupTask` (`@Cron`, daily 03:00) prunes stale anonymous users and expired email verification rows.

---

## API Reference

All endpoints prefixed with `/api/v1/auth`. Swagger available at `/api/docs` in development.

`GET /auth/me` (authenticated, `JwtAuthGuard`) returns the current user profile (`{ user }`).

---

## Security

- **Passwords:** bcrypt (10 rounds). Min 8 chars, uppercase, number, special char. Rules shared between frontend and backend via `getPasswordChecks()` from `@jovandyaz/auth`.
- **Token storage:** Refresh tokens stored in **HttpOnly cookies** (`rid`, `SameSite=Lax`, `path=/api/v1/auth`, Secure in production) and as **HMAC-SHA256 hashes**, keyed by `TOKEN_HASH_KEY`, in the database (never plaintext). `Lax` is sufficient because all auth routes are POST-only and Lax never attaches cookies to cross-site POST requests. Email/reset tokens (link and 6-digit code alike) are hashed the same keyed way — the HMAC key is what stops a stolen hash from being brute-forced offline, which matters for the code's low entropy. Link tokens are generated with `crypto.randomBytes(32)`; the code with `crypto.randomInt(0, 1_000_000)`.
- **Refresh token rotation:** Each refresh rotates the token within its family. Reuse past the grace window → the **token family** is revoked (not all user sessions). See [Token Refresh](#token-refresh).
- **Rate limiting:** All endpoints via `@nestjs/throttler`, through one app-wide guard that spends each budget per registered user and falls back to the IP for anonymous and unauthenticated callers. Exceeding → `429`.
- **Email enumeration:** `forgot-password` always returns success regardless of email existence.
- **Session management:** Password reset invalidates all sessions. Logout invalidates specific session. Metadata (user agent, IP) stored for audit.
- **Email service:** Delivery runs through `@jovandyaz/email-nestjs` and is selected by `EMAIL_PROVIDER`. **Resend** is the production provider (`ResendSender`, requires `RESEND_API_KEY`); the `console` provider (`ConsoleSender`) only logs emails and is for local development.

### Environment variables

| Variable                 | Required | Default                              | Description                                                                                                                                                                                                              |
| ------------------------ | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`             | Yes      | —                                    | Access token signing key                                                                                                                                                                                                 |
| `JWT_REFRESH_SECRET`     | Yes      | —                                    | Refresh token signing key                                                                                                                                                                                                |
| `TOKEN_HASH_KEY`         | Yes      | —                                    | HMAC key for every stored token hash (sessions, resets, email verification link + code). 32 bytes, base64 (`openssl rand -base64 32`). Read via `getOrThrow` at module construction, so the API will not boot without it |
| `JWT_EXPIRES_IN`         | No       | `15m`                                | Access token TTL                                                                                                                                                                                                         |
| `JWT_REFRESH_EXPIRES_IN` | No       | `7d`                                 | Refresh token TTL                                                                                                                                                                                                        |
| `FRONTEND_URL`           | No       | `http://localhost:4200`              | Base URL for email links                                                                                                                                                                                                 |
| `EMAIL_PROVIDER`         | No       | `console`                            | Email sender: `resend` (prod) \| `console` (dev)                                                                                                                                                                         |
| `RESEND_API_KEY`         | Cond.    | —                                    | Resend API key (required when `EMAIL_PROVIDER=resend`)                                                                                                                                                                   |
| `EMAIL_FROM`             | No       | `Knowtis <noreply@mail.knowtis.app>` | Default sender address                                                                                                                                                                                                   |
| `NODE_ENV`               | No       | `development`                        | Outside `production`, `EMAIL_PROVIDER=console` logs the rendered message body — the only way to read a verification code or reset link locally                                                                           |

---

## Database Schema

Four tables: `users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`.

- **`users`** — `id` (uuid PK), `email` (unique), `name`, `avatar_url`, `provider` (default `'local'`), `provider_id`, `password_hash`, `locale`, `is_anonymous` (default `false`), `role` (`user_role` enum: `'user'` | `'admin'`, default `'user'`), `email_verified_at`, timestamps
- **`sessions`** — `id` (uuid PK), `user_id` (FK), `family_id` (uuid, groups rotated tokens), `refresh_token_hash`, `rotated_at`, `user_agent`, `ip_address`, `expires_at`, `created_at`
- **`email_verification_tokens`** — `id` (uuid PK), `user_id` (FK), `token_hash`, `expires_at` (link, 24h), `code_hash`, `code_expires_at` (code, 15min), `attempts` (int, default `0`, capped at `VERIFICATION_CODE_MAX_ATTEMPTS`), `created_at`
- **`password_reset_tokens`** — `id` (uuid PK), `user_id` (FK), `token_hash`, `expires_at`, `created_at`

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

| Page                 | Route                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoginPage`          | `/login`                                                                                                                                                                                     |
| `RegisterPage`       | `/register`                                                                                                                                                                                  |
| `ForgotPasswordPage` | `/forgot-password`                                                                                                                                                                           |
| `ResetPasswordPage`  | `/reset-password?token=...`                                                                                                                                                                  |
| `VerifyEmailPage`    | `/verify-email?token=...` — signed-out visitors only; a signed-in account is redirected to the dashboard and offered the code dialog (see [Verifying from the app](#verifying-from-the-app)) |

---

## Domain Events

Auth operations emit events via NestJS `EventEmitter2`, logged by `AuthAuditListener`.

| Event                                                                  | Emitted by                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `auth.register`                                                        | RegisterUserHandler                                  |
| `auth.login` / `auth.login.failed`                                     | LoginUserHandler                                     |
| `auth.token.refresh`                                                   | RefreshTokensHandler                                 |
| `auth.logout`                                                          | LogoutUserHandler                                    |
| `auth.password.reset.requested` / `auth.password.reset.completed`      | ForgotPassword / ResetPasswordHandler                |
| `auth.email.verified` (`source`: `code` \| `link` \| `password_reset`) | VerifyEmailCode / VerifyEmail / ResetPasswordHandler |
