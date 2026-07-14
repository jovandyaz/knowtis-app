import type {
  AuthResponse,
  AuthTokens,
  LoginInput,
  RegisterInput,
  UserRole,
} from '@jovandyaz/auth';

/**
 * User profile returned by getProfile
 */
export interface AuthUserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isEmailVerified?: boolean;
  locale?: string;
  isAnonymous?: boolean;
  role?: UserRole;
}

/**
 * Adapter interface for auth API operations.
 * Consumers must provide an implementation that connects to their backend.
 */
export interface AuthApiAdapter {
  login(input: LoginInput): Promise<AuthResponse>;
  register(input: RegisterInput): Promise<AuthResponse>;
  logout(): Promise<void>;
  refreshToken(): Promise<AuthTokens>;
  getProfile(): Promise<AuthUserProfile>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(): Promise<void>;
}
