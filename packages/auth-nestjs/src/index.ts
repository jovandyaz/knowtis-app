// Module
export { AuthNestjsModule } from './lib/auth.module';
export type { AuthModuleOptions, TokenConfig } from './lib/auth.module';

// Guards
export { JwtAuthGuard } from './lib/guards/jwt-auth.guard';
export { LocalAuthGuard } from './lib/guards/local-auth.guard';

// Decorators
export { CurrentUser } from './lib/decorators/current-user.decorator';
export { Public, IS_PUBLIC_KEY } from './lib/decorators/public.decorator';

// Injection tokens
export {
  USER_REPOSITORY,
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  PASSWORD_HASHER,
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  AUTH_MODULE_OPTIONS,
} from './lib/constants';

// Port interfaces
export type {
  UserRepository,
  UserEntity,
  CreateUserData,
} from './lib/ports/user.repository';
export type {
  SessionRepository,
  SessionEntity,
  CreateSessionData,
} from './lib/ports/session.repository';
export type {
  TokenService,
  AuthTokens,
  JwtPayload,
} from './lib/ports/token.service';
export type { PasswordHasher } from './lib/ports/password-hasher.port';
export type { EmailService } from './lib/ports/email.service';
export type {
  EmailVerificationTokenRepository,
  EmailVerificationTokenEntity,
  CreateEmailVerificationTokenData,
} from './lib/ports/email-verification-token.repository';
export type {
  PasswordResetTokenRepository,
  PasswordResetTokenEntity,
  CreatePasswordResetTokenData,
} from './lib/ports/password-reset-token.repository';

// Handlers
export { LoginUserHandler } from './lib/handlers/login-user.handler';
export type {
  ValidateUserInput,
  ValidatedUser,
  LoginUserOutput,
  LoginSessionContext,
} from './lib/handlers/login-user.handler';

export { RegisterUserHandler } from './lib/handlers/register-user.handler';
export type {
  RegisterUserInput,
  RegisterUserOutput,
  RegisterSessionContext,
} from './lib/handlers/register-user.handler';

export { RefreshTokensHandler } from './lib/handlers/refresh-tokens.handler';
export { LogoutUserHandler } from './lib/handlers/logout-user.handler';

export { ForgotPasswordHandler } from './lib/handlers/forgot-password.handler';
export type { ForgotPasswordInput } from './lib/handlers/forgot-password.handler';

export { ResetPasswordHandler } from './lib/handlers/reset-password.handler';
export type { ResetPasswordInput } from './lib/handlers/reset-password.handler';

export { VerifyEmailHandler } from './lib/handlers/verify-email.handler';
export type { VerifyEmailInput } from './lib/handlers/verify-email.handler';

export { ResendVerificationHandler } from './lib/handlers/resend-verification.handler';
export type { ResendVerificationInput } from './lib/handlers/resend-verification.handler';

// HTTP utilities
export { unwrapOrThrow } from './lib/http/result-to-response';

// Logging
export { AuthAuditListener } from './lib/logging/auth-audit.listener';

// Strategies
export { JwtStrategy } from './lib/strategies/jwt.strategy';
export { LocalStrategy } from './lib/strategies/local.strategy';
