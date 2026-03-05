import { useEffect, useRef } from 'react';

import {
  useAuthApi,
  useAuthStore,
  useTokenStorage,
} from '../provider/auth-provider';

const DEFAULT_REFRESH_MARGIN_MS = 60_000;

interface UseSessionManagerOptions {
  refreshMarginMs?: number;
}

/**
 * Manages session lifecycle: bootstrap validation, proactive token refresh,
 * and visibility-change resume. Must be rendered inside AuthProvider.
 */
export function useSessionManager(
  options: UseSessionManagerOptions = {}
): void {
  const api = useAuthApi();
  const store = useAuthStore();
  const tokenStorage = useTokenStorage();
  const { refreshMarginMs = DEFAULT_REFRESH_MARGIN_MS } = options;

  const refreshMarginRef = useRef(refreshMarginMs);
  refreshMarginRef.current = refreshMarginMs;

  const apiRef = useRef(api);
  apiRef.current = api;

  const storeRef = useRef(store);
  storeRef.current = store;

  const tokenStorageRef = useRef(tokenStorage);
  tokenStorageRef.current = tokenStorage;

  // --- Bootstrap validation ---
  // On mount, if store says authenticated but no in-memory token, try silent refresh.
  // Anonymous users skip refresh (they use long-lived access tokens, no refresh tokens).
  useEffect(() => {
    const { isAuthenticated, user, setLoading, logout } =
      storeRef.current.getState();

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    if (user?.isAnonymous) {
      setLoading(false);
      return;
    }

    if (tokenStorageRef.current.hasTokens()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    apiRef.current
      .refreshToken()
      .then(() => {
        if (!cancelled) {
          storeRef.current.getState().setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          logout();
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Proactive refresh timer ---
  // Anonymous users use long-lived access tokens with no refresh tokens, so skip.
  useEffect(() => {
    if (store.getState().user?.isAnonymous) {
      return;
    }

    function scheduleRefresh(): ReturnType<typeof setTimeout> | null {
      const expiresAt = tokenStorage.getExpiresAt();
      if (!expiresAt) {
        return null;
      }

      const delay = Math.max(
        expiresAt - refreshMarginRef.current - Date.now(),
        0
      );

      return setTimeout(() => {
        api.refreshToken().catch(() => {
          store.getState().logout();
        });
      }, delay);
    }

    let timerId = scheduleRefresh();

    const unsubscribe = tokenStorage.subscribe(() => {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = scheduleRefresh();
    });

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      unsubscribe();
    };
  }, [api, tokenStorage, store]);

  // --- Visibility change handler ---
  // Anonymous users use long-lived access tokens with no refresh tokens, so skip.
  useEffect(() => {
    if (store.getState().user?.isAnonymous) {
      return;
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!store.getState().isAuthenticated) {
        return;
      }

      const expiresAt = tokenStorage.getExpiresAt();
      const tokenMissing = !tokenStorage.hasTokens();
      const tokenExpiringSoon =
        expiresAt !== null && expiresAt - Date.now() < refreshMarginRef.current;

      if (tokenMissing || tokenExpiringSoon) {
        api.refreshToken().catch(() => {
          store.getState().logout();
        });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [api, store, tokenStorage]);
}
