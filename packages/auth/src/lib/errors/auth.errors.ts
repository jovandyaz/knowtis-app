export interface AuthDomainError {
  readonly code: string;
  readonly message: string;
}

export const AuthErrorCodes = {
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_USER_ID: 'INVALID_USER_ID',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  INVALID_VERIFICATION_TOKEN: 'INVALID_VERIFICATION_TOKEN',
  VERIFICATION_TOKEN_EXPIRED: 'VERIFICATION_TOKEN_EXPIRED',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];

function createAuthError(
  code: AuthErrorCode,
  message: string
): AuthDomainError {
  return { code, message };
}

export const AuthErrors = {
  invalidEmail: (email: string) =>
    createAuthError(
      AuthErrorCodes.INVALID_EMAIL,
      `Invalid email format: ${email}`
    ),

  invalidPassword: () =>
    createAuthError(AuthErrorCodes.INVALID_PASSWORD, 'Invalid password'),

  invalidUserId: (reason: string) =>
    createAuthError(
      AuthErrorCodes.INVALID_USER_ID,
      `Invalid user ID: ${reason}`
    ),

  weakPassword: () =>
    createAuthError(
      AuthErrorCodes.WEAK_PASSWORD,
      'Password must be at least 8 characters'
    ),

  weakPasswordDetail: (detail: string) =>
    createAuthError(
      AuthErrorCodes.WEAK_PASSWORD,
      `Password too weak: ${detail}`
    ),

  emailAlreadyExists: (email: string) =>
    createAuthError(
      AuthErrorCodes.EMAIL_ALREADY_EXISTS,
      `Email already registered: ${email}`
    ),

  userNotFound: (identifier: string) =>
    createAuthError(
      AuthErrorCodes.USER_NOT_FOUND,
      `User not found: ${identifier}`
    ),

  invalidCredentials: () =>
    createAuthError(AuthErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'),

  invalidRefreshToken: () =>
    createAuthError(
      AuthErrorCodes.INVALID_REFRESH_TOKEN,
      'Invalid refresh token'
    ),

  tokenReuseDetected: (userId: string) =>
    createAuthError(
      AuthErrorCodes.TOKEN_REUSE_DETECTED,
      `Token reuse detected for user ${userId}. All sessions invalidated.`
    ),

  sessionExpired: () =>
    createAuthError(AuthErrorCodes.SESSION_EXPIRED, 'Session has expired'),

  invalidResetToken: () =>
    createAuthError(
      AuthErrorCodes.INVALID_RESET_TOKEN,
      'Invalid or expired password reset token'
    ),

  resetTokenExpired: () =>
    createAuthError(
      AuthErrorCodes.RESET_TOKEN_EXPIRED,
      'Password reset token has expired'
    ),

  invalidVerificationToken: () =>
    createAuthError(
      AuthErrorCodes.INVALID_VERIFICATION_TOKEN,
      'Invalid or expired email verification token'
    ),

  verificationTokenExpired: () =>
    createAuthError(
      AuthErrorCodes.VERIFICATION_TOKEN_EXPIRED,
      'Email verification token has expired'
    ),

  emailAlreadyVerified: () =>
    createAuthError(
      AuthErrorCodes.EMAIL_ALREADY_VERIFIED,
      'Email is already verified'
    ),

  emailSendFailed: () =>
    createAuthError(AuthErrorCodes.EMAIL_SEND_FAILED, 'Failed to send email'),

  internalError: (message: string) =>
    createAuthError(AuthErrorCodes.INTERNAL_ERROR, message),
} as const;
