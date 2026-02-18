// Browser-safe exports only (no node:crypto, no bcryptjs)

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

export { AuthErrors, AuthErrorCodes } from './lib/errors/auth.errors';
export type { AuthDomainError } from './lib/errors/auth.errors';
