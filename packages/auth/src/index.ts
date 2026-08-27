// Browser-safe exports only (no node:crypto, no bcryptjs)

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

export { AuthErrors, AuthErrorCodes } from './lib/errors/auth.errors';
export type { AuthDomainError } from './lib/errors/auth.errors';

export { VERIFICATION_RESEND_COOLDOWN_MS } from './lib/constants';
