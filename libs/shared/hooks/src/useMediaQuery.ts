import { useCallback, useSyncExternalStore } from 'react';

/**
 * Hook that tracks a CSS media query match state.
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns `true` if the query matches, `false` otherwise
 *
 * @example
 * ```tsx
 * const isDesktop = useMediaQuery('(min-width: 768px)');
 * const isMobile = useMediaQuery('(max-width: 767px)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query]
  );

  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
