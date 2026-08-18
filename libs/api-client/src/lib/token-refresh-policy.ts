import type { RefreshFailure } from './refresh-failure';

/**
 * `refreshed` means the new token is observable afterwards. `rejected` means the
 * credential is dead and retrying can never help. `unavailable` means the server
 * or network never answered, so the credential's fate is still unknown.
 */
export type RefreshOutcome = 'refreshed' | RefreshFailure;

export interface TokenRefreshHandlers {
  refresh: () => Promise<RefreshOutcome>;
  /** Runs after a successful refresh — reconnect and/or replay the request. */
  onRefreshed: () => void;
  /** Runs when the credential is dead, or when the single attempt was already spent. */
  onExhausted: () => void;
  /**
   * Runs when the refresh could not be judged. The attempt is not spent, so the
   * transport's own reconnect may try again. Falls back to `onExhausted`.
   */
  onUnavailable?: () => void;
  /** Optional sink for a thrown refresh; the throw is treated as `unavailable`. */
  onError?: (error: unknown) => void;
}

export interface TokenRefreshPolicy {
  recover: (handlers: TokenRefreshHandlers) => Promise<void>;
  reset: () => void;
}

/**
 * Transport-agnostic single-attempt token refresh, shared by the AI and agent
 * Socket.IO clients and the Hocuspocus collaboration provider. The attempt is
 * only spent on a judged outcome: an `unavailable` refresh hands it back so the
 * transport's own reconnect can try again. Each consumer supplies its own
 * refresh, reconnect, and teardown effects per call.
 */
export function createTokenRefreshPolicy(): TokenRefreshPolicy {
  let attempted = false;
  let inFlight = false;

  function giveTheAttemptBack(handlers: TokenRefreshHandlers): void {
    attempted = false;
    (handlers.onUnavailable ?? handlers.onExhausted)();
  }

  return {
    reset() {
      attempted = false;
    },

    async recover(handlers) {
      if (inFlight) {
        return;
      }
      if (attempted) {
        handlers.onExhausted();
        return;
      }

      attempted = true;
      inFlight = true;
      let outcome: RefreshOutcome;
      try {
        outcome = await handlers.refresh();
      } catch (error) {
        handlers.onError?.(error);
        outcome = 'unavailable';
      } finally {
        inFlight = false;
      }

      switch (outcome) {
        case 'refreshed':
          handlers.onRefreshed();
          break;
        case 'rejected':
          handlers.onExhausted();
          break;
        case 'unavailable':
          giveTheAttemptBack(handlers);
          break;
        default: {
          const unhandled: never = outcome;
          throw new Error(`Unhandled refresh outcome: ${String(unhandled)}`);
        }
      }
    },
  };
}
