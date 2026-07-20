---
paths:
  - 'apps/api/src/modules/auth/**'
  - 'apps/api/src/modules/ai/**'
  - 'packages/auth/**'
  - 'packages/auth-nestjs/**'
---

# Security Rules

## JWT Authentication

- Access token: stored in memory (Zustand store), sent via `Authorization: Bearer` header. Short-lived.
- Refresh token: stored in an HttpOnly cookie, path `/api/v1/auth`, `SameSite=Lax`. Set and cleared by the backend only. Lax is sufficient because all auth routes are POST-only and Lax never attaches cookies to cross-site POST requests.
- The cookie name is **per frontend**, resolved from the request `Origin`: `rid` for the notes app, `rid_bo` for the backoffice. Both frontends call one API origin, so a single name would make them share and rotate one refresh token — each refresh would then return the other app's identity, leaking an admin token into the notes app. Adding a new frontend means adding a name; never reuse one.
- Never store tokens in `localStorage` or `sessionStorage` — XSS can exfiltrate them.
- Token validation must check: signature, expiration, issuer. Use `@nestjs/jwt` `JwtService.verifyAsync()`.
- WebSocket auth: JWT sent via Socket.IO `auth.token` (not `extraHeaders` — those are stripped by some proxies).

## Refresh Token Rotation

- On each token refresh, issue a new refresh token and invalidate the old one.
- If a previously-invalidated refresh token is used, treat it as a token theft attempt: invalidate all tokens for that user.
- Refresh endpoint must be rate-limited independently from other auth endpoints.

## Password Handling

- Hash with bcrypt or argon2 with sufficient cost factor (bcrypt: minimum 10 rounds).
- Never log passwords, password hashes, or partial passwords.
- Never compare passwords in plaintext — always compare hashes.
- Password reset tokens must be single-use and time-limited.

## CSRF Protection

- `SameSite=Lax` on all auth cookies prevents CSRF: auth routes are POST-only and Lax blocks cookie sends on cross-site POSTs.
- For cross-origin scenarios, verify `Origin` header matches allowed origins.

## Rate Limiting

- Auth endpoints (login, register, refresh, password reset) must be rate-limited via `@nestjs/throttler`.
- Global rate limiting is configured in `AppModule` via `ThrottlerModule.forRoot()`.
- Use per-route overrides with `@Throttle()` decorator for sensitive endpoints.

## Secrets and Credentials

- All secrets must come from `ConfigService` (injected), validated by Zod schema at startup.
- Never hardcode API keys, database URLs, JWT secrets, or any credential in source code.
- Never commit `.env` files — only `.env.example` with placeholder values.
- Flag any `process.env` usage outside of `env.config.ts`.

## AI Module Security

- All AI endpoints must be gated by `FeatureFlagGuard` checking `ai_enabled` database flag.
- Rate limiting per user: prevent abuse of LLM API calls (cost control).
- API keys for external services (Anthropic) must come from `ConfigService`.
- Sanitize user input before sending to LLM — prompt injection is a real attack vector.
- Streaming responses: handle backpressure (slow clients), clean up on disconnect.
- Cache AI responses where appropriate to reduce API costs.

## Input Validation

- All controller inputs must be validated via class-validator DTOs.
- Sanitize HTML input to prevent stored XSS.
- Use parameterized queries exclusively (Drizzle ORM handles this by default).
- Validate UUIDs, email formats, and enum values at the boundary.
