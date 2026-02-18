// Storage
export { createTokenStorage } from './lib/storage/token-storage';
export type {
  TokenStorage,
  TokenStorageOptions,
} from './lib/storage/token-storage';

// Store
export { createAuthStore } from './lib/store/auth.store';
export type {
  CreateAuthStoreOptions,
  AuthStoreInstance,
} from './lib/store/auth.store';
export type {
  AuthUser,
  AuthState,
  AuthActions,
  AuthStore,
} from './lib/store/auth.store.types';

// Provider
export {
  AuthProvider,
  useAuthContext,
  useAuthApi,
  useTokenStorage,
  useAuthStore,
} from './lib/provider/auth-provider';
export type { AuthProviderProps } from './lib/provider/auth-provider';

// Hooks
export {
  authQueryKeys,
  useProfile,
  useLogin,
  useRegister,
  useLogout,
  useForgotPassword,
  useResetPassword,
  useVerifyEmail,
  useResendVerification,
  useRateLimitState,
  useAuth,
  useAuthUser,
  useIsAuthenticated,
  useAuthLoading,
} from './lib/hooks/auth.hooks';

// Schemas
export {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './lib/schemas/auth.schemas';
export type {
  LoginFormData,
  RegisterFormData,
  ForgotPasswordFormData,
  ResetPasswordFormData,
} from './lib/schemas/auth.schemas';

// Types
export type { AuthApiAdapter, AuthUserProfile } from './lib/types';
