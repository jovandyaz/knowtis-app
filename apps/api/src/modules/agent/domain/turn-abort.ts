export const TURN_ABORT_REASON = {
  CANCELLED: 'cancelled',
  DISCONNECTED: 'disconnected',
} as const;

export type TurnAbortReason =
  (typeof TURN_ABORT_REASON)[keyof typeof TURN_ABORT_REASON];

/** A user cancel keeps the message; any other abort (disconnect, token expiry, deploy drain) is the server's. */
export function isUserCancel(signal: AbortSignal | undefined): boolean {
  return signal?.reason === TURN_ABORT_REASON.CANCELLED;
}
