/**
 * `refreshed` means the new token is observable afterwards. `rejected` means the
 * credential is dead and retrying can never help. `unavailable` means the server
 * or network never answered, so the credential's fate is still unknown.
 */
export type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

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
 * Transport-agnostic "refresh the token once, then give up" policy shared by the
 * AI Socket.IO client and the Hocuspocus collaboration provider. Holds the
 * spent/in-flight guards; each consumer supplies its own refresh, reconnect, and
 * teardown effects per call.
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
      try {
        const outcome = await handlers.refresh();
        if (outcome === 'refreshed') {
          handlers.onRefreshed();
        } else if (outcome === 'rejected') {
          handlers.onExhausted();
        } else {
          giveTheAttemptBack(handlers);
        }
      } catch (error) {
        handlers.onError?.(error);
        giveTheAttemptBack(handlers);
      } finally {
        inFlight = false;
      }
    },
  };
}
