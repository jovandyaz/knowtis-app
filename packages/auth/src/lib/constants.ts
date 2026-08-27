export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Window after rotation where the previous refresh token is still accepted, so
 *  concurrent refreshes (multiple tabs) aren't flagged as theft. */
export const REFRESH_TOKEN_GRACE_MS = 30 * 1000;
export const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
