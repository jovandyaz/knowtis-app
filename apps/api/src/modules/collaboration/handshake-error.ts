import type { HandshakeFailureReason } from '@knowtis/shared-types';

/**
 * Handshake rejection whose `reason` is what the client's `onAuthenticationFailed`
 * receives: hocuspocus transmits `error.reason ?? 'permission-denied'`, so a plain
 * `Error` collapses every rejection into that one opaque string.
 */
export class HandshakeError extends Error {
  constructor(readonly reason: HandshakeFailureReason) {
    super(reason);
  }
}
