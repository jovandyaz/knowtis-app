# @jovandyaz/auth-nestjs

NestJS dynamic module wiring the auth use cases on top of [`@jovandyaz/auth/server`](../auth/README.md). The package owns the handlers, Passport strategies, guards, decorators and error mapping; the consuming app implements the port interfaces (repositories, token service, password hasher, email) and passes the classes to `AuthNestjsModule.register()`. Nx project name: `auth-nestjs`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/auth-nestjs --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` alias `@jovandyaz/auth-nestjs`.

## Peer dependencies

`@jovandyaz/auth`, `@nestjs/common ^11`, `@nestjs/core ^11`, `@nestjs/event-emitter ^3`, `@nestjs/jwt ^11`, `@nestjs/passport ^11`, `neverthrow ^8`, `passport-jwt ^4`, `passport-local ^1`, `rxjs ^7.8`, `express 5.2.1`.

## Exports

From `src/index.ts`:

- **Module:** `AuthNestjsModule.register(options: AuthModuleOptions)`. `AuthModuleOptions`: `tokenConfig` (`TokenConfig`: `accessTokenSecret`, `refreshTokenSecret`, `accessTokenExpiresIn?` default `'15m'`, `refreshTokenExpiresIn?`, `additionalPublicKeys?` PEM keys for ES256 verification), `tokenHashKey` (32 bytes, base64), `passwordSaltRounds?`, `imports?`, and the port classes `userRepository`, `sessionRepository`, `tokenService`, `passwordHasher`, optional `emailService` (+ `useExistingEmailService` to bind with `useExisting`), `emailVerificationTokenRepository`, `passwordResetTokenRepository`.
- **Ports (consumer implements):** `UserRepository` (`UserEntity`, `CreateUserData`), `SessionRepository` (`SessionEntity`, `CreateSessionData`), `TokenService` (`JwtPayload`), `PasswordHasher` (returns `Result<_, AuthDomainError>`, unlike the plain-promise hasher in `@jovandyaz/auth/server`), `EmailService`, `EmailVerificationTokenRepository` (`EmailVerificationTokenEntity`, `CreateEmailVerificationTokenData`), `PasswordResetTokenRepository` (`PasswordResetTokenEntity`, `CreatePasswordResetTokenData`).
- **DI tokens:** `USER_REPOSITORY`, `SESSION_REPOSITORY`, `TOKEN_SERVICE`, `PASSWORD_HASHER`, `TOKEN_HASHER`, `EMAIL_SERVICE`, `EMAIL_VERIFICATION_TOKEN_REPOSITORY`, `PASSWORD_RESET_TOKEN_REPOSITORY`, `AUTH_MODULE_OPTIONS`; JWT claim constants `JWT_ISSUER` (`knowtis-api`), `JWT_AUDIENCE_ACCESS` (`knowtis:access`), `JWT_AUDIENCE_REFRESH` (`knowtis:refresh`).
- **Services:** `TokenHasher` (built by the module from `tokenHashKey`; throws at construction if the key does not decode to 32 bytes), `createSessionWithTokens(deps, params)` (mints a token pair for a `familyId` and persists the session with `SESSION_EXPIRY_MS`).
- **Handlers** (all return `Result<T, AuthDomainError>`): `LoginUserHandler` (`ValidateUserInput`, `ValidatedUser`, `LoginUserOutput`), `RegisterUserHandler` (`RegisterUserInput`, `RegisterUserOutput`), `RefreshTokensHandler`, `LogoutUserHandler`, `ForgotPasswordHandler` (`ForgotPasswordInput`), `ResetPasswordHandler` (`ResetPasswordInput`), `VerifyEmailHandler` (`VerifyEmailInput`), `VerifyEmailCodeHandler` (`VerifyEmailCodeInput`), `ResendVerificationHandler` (`ResendVerificationInput`).
- **Guards and decorators:** `JwtAuthGuard` (Passport `jwt`, honours `@Public()`), `LocalAuthGuard`, `@CurrentUser()`, `@Public()`, `IS_PUBLIC_KEY`. The module provides and exports the guards but does not register them as `APP_GUARD`; controllers opt in with `@UseGuards(JwtAuthGuard)`.
- **Strategies:** `JwtStrategy`, `LocalStrategy`.
- **HTTP:** `AUTH_ERROR_STATUS_MAP` (`AuthErrorCode` to `HttpStatus`).
- **Logging:** `AuthAuditListener` (`@OnEvent` handlers for every `AuthEventName`).

### JwtStrategy behaviour

Bearer tokens are verified by header `alg`: `HS256` against `accessTokenSecret`, `ES256` against the first entry of `additionalPublicKeys`; anything else is rejected. Tokens without a `source` claim are session tokens and must carry `iss === JWT_ISSUER`, `aud === JWT_AUDIENCE_ACCESS` and a string `familyId`, and `SessionRepository.hasLiveSessionForFamily(familyId)` must be true, so a logged-out family is refused immediately. Tokens with a `source` claim (MCP exchange, OAuth) skip the session check; the app is expected to gate them separately. `validate()` returns a `RequestUser`.

## Usage

```ts
import { AuthNestjsModule } from '@jovandyaz/auth-nestjs';
import { Module } from '@nestjs/common';

// The consumer's @Injectable() implementations of the port interfaces.
declare class DrizzleUserRepository {}
declare class DrizzleSessionRepository {}
declare class JwtTokenService {}
declare class BcryptPasswordHasher {}

@Module({
  imports: [
    AuthNestjsModule.register({
      tokenConfig: {
        accessTokenSecret: process.env.JWT_SECRET ?? '',
        refreshTokenSecret: process.env.JWT_REFRESH_SECRET ?? '',
        accessTokenExpiresIn: '15m',
        refreshTokenExpiresIn: '7d',
      },
      tokenHashKey: process.env.TOKEN_HASH_KEY ?? '',
      userRepository: DrizzleUserRepository,
      sessionRepository: DrizzleSessionRepository,
      tokenService: JwtTokenService,
      passwordHasher: BcryptPasswordHasher,
    }),
  ],
})
export class AuthModule {}
```

The full wiring used by the API, including `additionalPublicKeys` for MCP OAuth tokens and the optional email ports, is `apps/api/src/modules/auth/auth.module.ts`.

## Development

```bash
pnpm nx test auth-nestjs
pnpm nx lint auth-nestjs
```

Specs sit next to their sources and under `src/lib/**/__tests__/`.
