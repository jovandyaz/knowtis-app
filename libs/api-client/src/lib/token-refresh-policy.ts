export interface TokenRefreshHandlers {
  /** Resolves `true` only when the new token is observable afterwards; `false`/throw is terminal. */
  refresh: () => Promise<boolean>;
  /** Runs after a successful refresh — reconnect and/or replay the request. */
  onRefreshed: () => void;
  /** Runs when recovery is given up: refresh failed, threw, or was already spent. */
  onExhausted: () => void;
  /** Optional sink for a thrown refresh; `onExhausted` still runs afterwards. */
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
        const refreshed = await handlers.refresh();
        if (refreshed) {
          handlers.onRefreshed();
        } else {
          handlers.onExhausted();
        }
      } catch (error) {
        handlers.onError?.(error);
        handlers.onExhausted();
      } finally {
        inFlight = false;
      }
    },
  };
}
