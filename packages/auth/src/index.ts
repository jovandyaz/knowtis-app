// Types
export type {
  LoginInput,
  RegisterInput,
  AuthTokens,
  AuthResponse,
  RequestUser,
  PasswordRequirements,
  PasswordCheck,
} from './lib/types/auth.types';
export {
  getPasswordChecks,
  PASSWORD_REQUIREMENTS,
} from './lib/types/auth.types';

// Errors
export { AuthErrors, AuthErrorCodes } from './lib/errors/auth.errors';
export type { AuthDomainError } from './lib/errors/auth.errors';

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
  UserLoggedInEvent,
  LoginFailedEvent,
  TokenRefreshedEvent,
  UserLoggedOutEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
} from './lib/events/auth.events';

// Session types
export type { SessionContext } from './lib/session/session.types';

// Constants
export {
  SESSION_EXPIRY_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
  RESET_TOKEN_EXPIRY_MS,
} from './lib/constants';
