export { createTokenStorage } from './lib/storage/token-storage';
export type { TokenStorage } from './lib/storage/token-storage';

export { createAuthStore } from './lib/store/auth.store';
export type {
  CreateAuthStoreOptions,
  AuthStoreInstance,
} from './lib/store/auth.store';
export type {
  AuthState,
  AuthActions,
  AuthStore,
} from './lib/store/auth.store.types';

export {
  AuthProvider,
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
  createLoginSchema,
  createRegisterSchema,
  createForgotPasswordSchema,
  createResetPasswordSchema,
} from './lib/schemas/auth.schemas';
export type {
  LoginFormData,
  RegisterFormData,
  ForgotPasswordFormData,
  ResetPasswordFormData,
} from './lib/schemas/auth.schemas';

// Types
export type { AuthApiAdapter, AuthUserProfile } from './lib/types';
