// Types (browser-safe, also available from @jovandyaz/auth)
export type {
  LoginInput,
  RegisterInput,
  AuthTokens,
  AuthResponse,
  RequestUser,
  UserRole,
  PasswordRequirements,
  PasswordCheck,
} from './lib/types/auth.types';
export {
  getPasswordChecks,
  PASSWORD_REQUIREMENTS,
  USER_ROLE,
} from './lib/types/auth.types';

// Errors (browser-safe, also available from @jovandyaz/auth)
export { AuthErrors, AuthErrorCodes } from './lib/errors/auth.errors';
export type { AuthDomainError, AuthErrorCode } from './lib/errors/auth.errors';

// Server-only exports below (node:crypto, bcryptjs)

// Value Objects
export { Email } from './lib/value-objects/email.vo';
export { Password } from './lib/value-objects/password.vo';
export { UserId } from './lib/value-objects/user-id.vo';

// Password
export { createPasswordHasher } from './lib/password/password-hasher';
export type { PasswordHasher } from './lib/password/password-hasher';

// Tokens
export { hashToken } from './lib/tokens/hash-token';

// Events
export {
  AuthEventName,
  UserRegisteredEvent,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserLoggedInEvent,
  LoginFailedEvent,
  TokenRefreshedEvent,
  UserLoggedOutEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
} from './lib/events/auth.events';
export type { EmailVerificationSource } from './lib/events/auth.events';

// Session types
export type { SessionContext } from './lib/session/session.types';

// Constants
export {
  SESSION_EXPIRY_MS,
  REFRESH_TOKEN_GRACE_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  RESET_TOKEN_EXPIRY_MS,
} from './lib/constants';

export { msUntilResendAllowed } from './lib/verification/resend-cooldown';
