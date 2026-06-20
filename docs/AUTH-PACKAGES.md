# Auth Packages

Architecture of `@jovandyaz/auth`, `@jovandyaz/auth-react`, and `@jovandyaz/auth-nestjs`.

For flows, API reference, security, and database schema, see [AUTH.md](AUTH.md).

---

## Dependency Graph

```
@jovandyaz/auth          (browser-safe: types, errors, password checks)
      ^           ^
      |           |
auth-react      auth-nestjs + apps/api
                  (import from @jovandyaz/auth/server for server-only exports)
```

`@jovandyaz/auth` is the main entry point (browser-safe). `@jovandyaz/auth/server` adds server-only exports (`node:crypto`, `bcryptjs`, value objects, events).

---

## `@jovandyaz/auth`

**Path:** `packages/auth/` — Isomorphic core shared by both React and NestJS layers.

**Two entry points:**

| Import path              | Environment  | Contents                                        |
| ------------------------ | ------------ | ----------------------------------------------- |
| `@jovandyaz/auth`        | Browser-safe | Types, errors, `getPasswordChecks()`            |
| `@jovandyaz/auth/server` | Server only  | + Value objects, `hashToken`, events, constants |

**`@jovandyaz/auth`** (browser-safe): `LoginInput`, `RegisterInput`, `AuthTokens` (readonly), `AuthResponse`, `RequestUser`, `USER_ROLE` / `UserRole`, `PasswordRequirements`, `PasswordCheck`, `getPasswordChecks()`, `PASSWORD_REQUIREMENTS`, `AuthDomainError`, `AuthErrorCodes`, `AuthErrors`.

> `RequestUser` carries `role: UserRole` (`'user'` | `'admin'`) and optional `isAnonymous?: boolean`. Anonymous sessions are minted at the app level (`AnonymousAuthService` in `apps/api`), not by these packages; see [AUTH.md › Anonymous Users](AUTH.md#anonymous-users).

**`@jovandyaz/auth/server`** (server-only, includes all browser-safe exports plus): Value objects (`Email`, `Password`, `UserId` — all return `Result` via neverthrow), `hashToken()`, `createPasswordHasher()`, `SessionContext`, expiry constants (`SESSION_EXPIRY_MS`, `VERIFICATION_TOKEN_EXPIRY_MS`, `RESET_TOKEN_EXPIRY_MS`, `REFRESH_TOKEN_GRACE_MS`), domain events. All exports come from their original source modules — no re-exports.

---

## `@jovandyaz/auth-react`

**Path:** `packages/auth-react/` — React integration, fully decoupled from any HTTP client.
**Peer deps:** `@jovandyaz/auth`, `@tanstack/react-query`, `react`, `zod`, `zustand`

**Key concept:** Consumers implement `AuthApiAdapter` and inject it via `<AuthProvider>`. The package provides hooks and store but makes no HTTP calls itself.

**Exports:**

- **Token storage:** `createTokenStorage()` — access token in-memory, refresh token managed by backend HttpOnly cookie (not accessible from JS)
- **Store:** `createAuthStore()` — Zustand with `user`, `isAuthenticated`, `isLoading`. Persisted via `zustand/persist`, triggers silent refresh on rehydration if previously authenticated
- **Provider:** `<AuthProvider api={adapter} tokenStorage={...} store={...}>`
- **Query hooks:** `useLogin()`, `useRegister()`, `useLogout()`, `useProfile()`, `useForgotPassword()`, `useResetPassword()`, `useVerifyEmail()`, `useResendVerification()`
- **Selector hooks:** `useAuth()`, `useAuthUser()`, `useIsAuthenticated()`, `useAuthLoading()`
- **Utility hooks:** `useRateLimitState()`, `useAuthApi()`, `useTokenStorage()`, `useAuthStore()`
- **Zod schemas:** `loginSchema`, `registerSchema`, `forgotPasswordSchema`, `resetPasswordSchema` (password rules synced via `getPasswordChecks()`)

---

## `@jovandyaz/auth-nestjs`

**Path:** `packages/auth-nestjs/` — NestJS dynamic module with Ports & Adapters pattern.
**Peer deps:** `@jovandyaz/auth` (imports from `/server`), `@nestjs/*`, `neverthrow`, `passport-jwt`, `passport-local`

**Key concept:** `AuthNestjsModule.register(options)` wires all auth handlers. Consumers implement port interfaces and pass concrete classes.

**Ports** (consumers implement):
`UserRepository`, `SessionRepository`, `TokenService`, `PasswordHasher`, `EmailService` (optional), `EmailVerificationTokenRepository` (optional), `PasswordResetTokenRepository` (optional).

**Handlers** (use cases, all return `Result<T, AuthDomainError>`):
`LoginUserHandler`, `RegisterUserHandler`, `RefreshTokensHandler`, `LogoutUserHandler`, `ForgotPasswordHandler`, `ResetPasswordHandler`, `VerifyEmailHandler`, `ResendVerificationHandler`.

**Guards & Decorators:** `JwtAuthGuard` (global, respects `@Public()`), `LocalAuthGuard`, `@CurrentUser()`.

**Strategies:** `JwtStrategy` (Bearer token → user lookup), `LocalStrategy` (email/password → credential validation).

**Utility:** `unwrapOrThrow()` — maps `Result` errors to HTTP exceptions.

**DI tokens:** `USER_REPOSITORY`, `SESSION_REPOSITORY`, `TOKEN_SERVICE`, `PASSWORD_HASHER`, `EMAIL_SERVICE`, `EMAIL_VERIFICATION_TOKEN_REPOSITORY`, `PASSWORD_RESET_TOKEN_REPOSITORY`.

---

## How It Connects

**Backend (`apps/api`):**

```
Controller → injects Handlers → Handlers use Ports ← apps/api/infrastructure implements Ports
```

**Frontend (`apps/notes`):**

```
<AuthProvider> → adapter (auth-api-adapter.ts) → IHttpClient (@knowtis/api-client)
Components → useLogin(), useAuth(), etc. → adapter → REST API
HttpClient handles 401 → refresh callback → retry (transparent)
```

---

## Design Decisions

- **`auth/server` subpath** — server-only exports are explicit; main entry is always browser-safe
- **`AuthApiAdapter` interface** — decouples React hooks from HTTP implementation
- **In-memory access tokens** — reduces XSS attack surface
- **HttpOnly cookie for refresh tokens** — not accessible from JS, mitigates XSS token theft. Cookie: `rid`, path `/api/v1/auth`, `SameSite=Lax`, Secure in production (Lax is safe because auth routes are POST-only)
- **`AuthTokens` in `@jovandyaz/auth`** — single source of truth for both packages
- **Port interfaces in `auth-nestjs`** — implementations live in the consuming app, not the package
- **`PasswordHasher` differs per package** — `auth` returns `Promise<string>` (utility), `auth-nestjs` returns `Result<string, AuthDomainError>` (DDD). Intentionally different contracts
- **Optional email providers** — allows deploying without email features
