/**
 * Authentication types shared between frontend and backend
 */

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
  tokens: AuthTokens;
}

/**
 * User object attached to requests after JWT validation
 * Used by controllers to access the authenticated user's information
 */
export interface RequestUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * Password complexity requirements shared between frontend and backend.
 * Frontend can use these to show validation hints before submission.
 */
export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

export interface PasswordCheck {
  readonly label: string;
  readonly test: (password: string) => boolean;
}

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export function getPasswordChecks(): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    {
      label: `At least ${PASSWORD_REQUIREMENTS.minLength} characters`,
      test: (p) => p.length >= PASSWORD_REQUIREMENTS.minLength,
    },
  ];

  if (PASSWORD_REQUIREMENTS.requireUppercase) {
    checks.push({
      label: 'Contains uppercase letter',
      test: (p) => /[A-Z]/.test(p),
    });
  }

  if (PASSWORD_REQUIREMENTS.requireNumber) {
    checks.push({
      label: 'Contains number',
      test: (p) => /[0-9]/.test(p),
    });
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChar) {
    checks.push({
      label: 'Contains special character',
      test: (p) => SPECIAL_CHAR_REGEX.test(p),
    });
  }

  return checks;
}
