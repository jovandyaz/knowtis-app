# @jovandyaz/auth

Framework-free auth core shared by [`@jovandyaz/auth-react`](../auth-react/README.md), [`@jovandyaz/auth-nestjs`](../auth-nestjs/README.md) and the API. Two entry points: the root is browser-safe (types, errors, password rules); `./server` adds the Node-only pieces (`node:crypto`, `bcryptjs`, value objects, events). Nx project name: `auth-core`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/auth --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` aliases `@jovandyaz/auth` and `@jovandyaz/auth/server`; nothing is installed.

## Exports

`@jovandyaz/auth` (`src/index.ts`, browser-safe):

- Types: `LoginInput`, `RegisterInput`, `AuthTokens`, `AuthResponse`, `RequestUser`, `UserRole`, `PasswordRequirements`, `PasswordCheck`
- `USER_ROLE` (`'user' | 'admin'`), `PASSWORD_REQUIREMENTS`, `getPasswordChecks(requirements?)`
- `AuthErrors` (factories), `AuthErrorCodes`, `AuthDomainError` (`{ code, message, retryAfterMs? }`)
- `VERIFICATION_CODE_LENGTH` (6), `VERIFICATION_RESEND_COOLDOWN_MS` (60 s)

`RequestUser` is the object controllers receive after JWT validation: `id`, `email`, `name`, `role`, plus optional `avatarUrl`, `emailVerifiedAt`, `locale`, `isAnonymous`, `familyId`.

`@jovandyaz/auth/server` (`src/server.ts`) re-exports everything above, adds `AuthErrorCode`, and:

- Value objects: `Email`, `Password`, `UserId` (`create()` returns a neverthrow `Result`; `fromTrusted()` skips validation)
- `createPasswordHasher(saltRounds = 12)` and the `PasswordHasher` type (`hash`/`verify` returning plain promises)
- `hashToken(token, key: Buffer)`: HMAC-SHA256 hex digest
- Events: `AuthEventName`, `EMAIL_VERIFICATION_SOURCE`, `EmailVerificationSource`, and the event classes `UserRegisteredEvent`, `EmailVerifiedEvent`, `UserLoggedInEvent`, `LoginFailedEvent`, `TokenRefreshedEvent`, `UserLoggedOutEvent`, `PasswordResetRequestedEvent`, `PasswordResetCompletedEvent`
- `SessionContext` (`{ userAgent?, ipAddress? }`)
- Constants: `SESSION_EXPIRY_MS` (7 d), `REFRESH_TOKEN_GRACE_MS` (30 s), `VERIFICATION_TOKEN_EXPIRY_MS` (24 h), `VERIFICATION_CODE_EXPIRY_MS` (15 min), `VERIFICATION_CODE_MAX_ATTEMPTS` (5), `RESET_TOKEN_EXPIRY_MS` (1 h), plus the two browser-safe ones
- `msUntilResendAllowed(issuedAt: Date)`

## Dependencies

Runtime: `bcryptjs`, `neverthrow`, `tslib`. No peer dependencies.

## Usage

```ts
import { AuthErrors, getPasswordChecks } from '@jovandyaz/auth';
import { Email, hashToken } from '@jovandyaz/auth/server';

const failed = getPasswordChecks().filter((check) => !check.test('weak'));

const email = Email.create('User@Example.com');
if (email.isErr()) {
  throw new Error(email.error.message);
}
email.value.value; // 'user@example.com'

const digest = hashToken(
  'token',
  Buffer.from(process.env.TOKEN_HASH_KEY ?? '', 'base64')
);
const error = AuthErrors.resendCooldown(5_000); // { code: 'RESEND_COOLDOWN', retryAfterMs: 5000 }
```

## Development

```bash
pnpm nx test auth-core
pnpm nx lint auth-core
```

Tests live in `src/lib/__tests__/`.
