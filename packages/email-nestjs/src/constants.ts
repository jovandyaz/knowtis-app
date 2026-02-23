// DI tokens
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const EMAIL_MODULE_OPTIONS = Symbol('EMAIL_MODULE_OPTIONS');

// Auth email subjects
export const EMAIL_SUBJECT_VERIFY = 'Verify your email — Knowtis';
export const EMAIL_SUBJECT_RESET_PASSWORD = 'Reset your password — Knowtis';

// Frontend URL paths for auth emails
export const AUTH_PATH_VERIFY_EMAIL = '/verify-email';
export const AUTH_PATH_RESET_PASSWORD = '/reset-password';

// Error codes
export const EMAIL_ERROR_SEND_FAILED = 'EMAIL_SEND_FAILED' as const;

// Defaults
export const DEFAULT_FRONTEND_URL = 'http://localhost:4200';
export const DEFAULT_FROM_ADDRESS = 'Knowtis <noreply@knowtis.com>';
