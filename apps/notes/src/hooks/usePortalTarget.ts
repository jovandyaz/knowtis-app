import { useCallback, useSyncExternalStore } from 'react';

/**
 * Resolves a portal target element by id, recovering when the target mounts
 * after the consumer (observes the DOM until the element appears).
 */
export function usePortalTarget(id: string): HTMLElement | null {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const observer = new MutationObserver(onStoreChange);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const getSnapshot = useCallback(() => document.getElementById(id), [id]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
