export interface VerifiedUserBroadcast {
  id: string;
  emailVerifiedAt: string;
}

interface CrossTabSyncOptions {
  storageKey: string;
  onLogoutDetected: () => void;
  /** Fires when another tab persists an authenticated user whose email is verified. */
  onVerifiedUserDetected?: (user: VerifiedUserBroadcast) => void;
}

function verifiedUserOf(
  state: Record<string, unknown>
): VerifiedUserBroadcast | null {
  const user = state['user'];
  if (typeof user !== 'object' || user === null) {
    return null;
  }
  const { id, emailVerifiedAt } = user as Record<string, unknown>;
  return typeof id === 'string' && typeof emailVerifiedAt === 'string'
    ? { id, emailVerifiedAt }
    : null;
}

/**
 * Listens for localStorage changes from other tabs.
 */
export function createCrossTabSync(options: CrossTabSyncOptions): () => void {
  const { storageKey, onLogoutDetected, onVerifiedUserDetected } = options;

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
          'isAuthenticated' in state
        ) {
          const record = state as Record<string, unknown>;
          if (record['isAuthenticated'] === false) {
            onLogoutDetected();
          } else if (record['isAuthenticated'] === true) {
            const verified = verifiedUserOf(record);
            if (verified) {
              onVerifiedUserDetected?.(verified);
            }
          }
        }
      }
    } catch {
      console.error('Error parsing storage event:', event.newValue);
    }
  }

  window.addEventListener('storage', handleStorageEvent);
  return () => window.removeEventListener('storage', handleStorageEvent);
}
