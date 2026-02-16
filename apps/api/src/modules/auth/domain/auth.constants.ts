export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export interface SessionContext {
  readonly userAgent?: string | undefined;
  readonly ipAddress?: string | undefined;
}
