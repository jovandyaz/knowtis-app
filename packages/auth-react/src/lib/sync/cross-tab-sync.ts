interface CrossTabSyncOptions {
  storageKey: string;
  onLogoutDetected: () => void;
}

/**
 * Listens for localStorage changes from other tabs.
 */
export function createCrossTabSync(options: CrossTabSyncOptions): () => void {
  const { storageKey, onLogoutDetected } = options;

  function handleStorageEvent(event: StorageEvent): void {
    if (event.key !== storageKey) {
      return;
    }

    if (event.newValue === null) {
      onLogoutDetected();
      return;
    }

    try {
      const parsed: unknown = JSON.parse(event.newValue);

      if (typeof parsed === 'object' && parsed !== null && 'state' in parsed) {
        const state = (parsed as Record<string, unknown>)['state'];
        if (
          typeof state === 'object' &&
          state !== null &&
          'isAuthenticated' in state &&
          (state as Record<string, unknown>)['isAuthenticated'] === false
        ) {
          onLogoutDetected();
        }
      }
    } catch {
      console.error('Error parsing storage event:', event.newValue);
    }
  }

  window.addEventListener('storage', handleStorageEvent);
  return () => window.removeEventListener('storage', handleStorageEvent);
}
