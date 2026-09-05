import { VERIFICATION_RESEND_COOLDOWN_MS } from '../constants';

/**
 * Milliseconds left before another verification email may be requested, or 0
 * once the window has closed. Never negative, so callers can treat any positive
 * result as "still cooling down".
 */
export function msUntilResendAllowed(
  issuedAt: Date,
  cooldownMs: number = VERIFICATION_RESEND_COOLDOWN_MS
): number {
  const elapsed = Date.now() - issuedAt.getTime();
  return Math.max(0, cooldownMs - elapsed);
}
