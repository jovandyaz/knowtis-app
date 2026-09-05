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

export { readPersistedAuth } from './lib/store/persisted-auth';
export type {
  PersistedAuthSnapshot,
  PersistedUser,
} from './lib/store/persisted-auth';

export {
  AuthProvider,
  useAuthApi,
  useTokenStorage,
  useAuthStore,
} from './lib/provider/auth-provider';
export type { AuthProviderProps } from './lib/provider/auth-provider';

export {
  authQueryKeys,
  useProfile,
  useLogin,
  useRegister,
  useLogout,
  useForgotPassword,
  useResetPassword,
  useVerifyEmail,
  useVerifyEmailCode,
  useResendVerification,
  useAuth,
  useAuthUser,
  useIsAuthenticated,
  useAuthLoading,
} from './lib/hooks/auth.hooks';

export { useSessionManager } from './lib/hooks/use-session-manager';

export {
  createCrossTabSync,
  type VerifiedUserBroadcast,
} from './lib/sync/cross-tab-sync';

export { parseTokenExpiry } from './lib/utils/token-expiry';

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

export type { AuthApiAdapter, AuthUserProfile } from './lib/types';
