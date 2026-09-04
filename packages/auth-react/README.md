# @jovandyaz/auth-react

React bindings for [`@jovandyaz/auth`](../auth/README.md): a Zustand store, TanStack Query hooks, a provider, in-memory token storage and Zod form schemas. The package makes no HTTP calls; the consumer implements `AuthApiAdapter` and passes it to `AuthProvider`. Nx project name: `auth-react`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/auth-react --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` alias `@jovandyaz/auth-react`.

## Peer dependencies

`@jovandyaz/auth`, `@tanstack/react-query ^5`, `react ^18 || ^19`, `zod ^3 || ^4`, `zustand ^5`.

## Exports

From `src/index.ts`:

- **Adapter contract:** `AuthApiAdapter` (`login`, `register`, `logout`, `refreshToken`, `getProfile`, `forgotPassword`, `resetPassword`, `verifyEmail`, `verifyEmailCode`, `resendVerification`), `AuthUserProfile`
- **Token storage:** `createTokenStorage()` returns `TokenStorage` (`setAccessToken`, `getAccessToken`, `getExpiresAt`, `clearTokens`, `hasTokens`, `subscribe`). Access token in memory only; expiry is parsed from the JWT `exp`. The refresh token is expected to live in an HttpOnly cookie set by the backend.
- **Store:** `createAuthStore({ tokenStorage, storageKey? })` returns `AuthStoreInstance` (`AuthStore` = `AuthState` + `AuthActions`: `user`, `isLoading`, `isAuthenticated`, `setUser`, `handleAuthSuccess`, `logout`, `setLoading`). Persisted with `zustand/middleware` `persist` under `storageKey` (default `auth-store`); only `isAuthenticated` and the `user` fields `id`, `email`, `name`, `avatarUrl`, `isAnonymous`, `emailVerifiedAt` and `locale` are persisted (`role` and any other profile field stay in memory). On rehydration the store keeps `isLoading` true when a previous session was authenticated; it does not refresh by itself.
- **Persisted snapshot:** `readPersistedAuth(storageKey)` returns `PersistedAuthSnapshot | null` (`PersistedUser`) for reading the persisted state before React mounts.
- **Provider:** `AuthProvider` (`AuthProviderProps`: `api`, `tokenStorage`, `store`, `children`) and context hooks `useAuthApi()`, `useTokenStorage()`, `useAuthStore()`.
- **Query hooks:** `authQueryKeys`, `useProfile()`, `useLogin()`, `useRegister()`, `useLogout()`, `useForgotPassword()`, `useResetPassword()`, `useVerifyEmail(token)` (a query keyed by the emailed token, so it is redeemed once per session), `useVerifyEmailCode()`, `useResendVerification()`
- **Selector hooks:** `useAuth()`, `useAuthUser()`, `useIsAuthenticated()`, `useAuthLoading()`
- **Session lifecycle:** `useSessionManager({ refreshMarginMs?, isTerminalRefreshFailure? })`, rendered inside `AuthProvider`. On mount it runs a silent `refreshToken()` when the store says authenticated but no access token is in memory; it schedules a proactive refresh `refreshMarginMs` (default 60 s) before `exp`; and it refreshes on `visibilitychange` when the token is missing or about to expire. Anonymous users are skipped. A failing refresh calls `logout()` unless `isTerminalRefreshFailure(error)` returns `false`.
- **Cross-tab:** `createCrossTabSync({ storageKey, onLogoutDetected })` listens to `storage` events and returns an unsubscribe function.
- **Utilities:** `parseTokenExpiry(token)` returns the `exp` claim in ms or `null`.
- **Zod schemas:** `createLoginSchema(t)`, `createRegisterSchema(t)`, `createForgotPasswordSchema(t)`, `createResetPasswordSchema(t)`, each taking an i18n `t(key, options?)` function; inferred types `LoginFormData`, `RegisterFormData`, `ForgotPasswordFormData`, `ResetPasswordFormData`. Password rules come from `getPasswordChecks()`.

## Usage

```tsx
import {
  AuthProvider,
  createAuthStore,
  createTokenStorage,
  useSessionManager,
  type AuthApiAdapter,
} from '@jovandyaz/auth-react';

const tokenStorage = createTokenStorage();
const store = createAuthStore({ tokenStorage });

declare const api: AuthApiAdapter;

function SessionManager() {
  useSessionManager({ refreshMarginMs: 60_000 });
  return null;
}

export function AppAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider api={api} tokenStorage={tokenStorage} store={store}>
      <SessionManager />
      {children}
    </AuthProvider>
  );
}
```

The adapter used by the notes app is `apps/notes/src/auth/auth-api-adapter.ts`.

## Development

```bash
pnpm nx test auth-react
pnpm nx lint auth-react
```

Tests live in `src/lib/__tests__/` (jsdom).
