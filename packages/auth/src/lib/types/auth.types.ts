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

export const USER_ROLE = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
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
  isAnonymous?: boolean;
  role: UserRole;
}

/**
 * Password complexity requirements shared between frontend and backend.
 * Frontend can use these to show validation hints before submission.
 */
export interface PasswordRequirements {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireNumber: boolean;
  readonly requireSpecialChar: boolean;
}

export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
} as const satisfies PasswordRequirements;

export interface PasswordCheck {
  readonly label: string;
  readonly test: (password: string) => boolean;
}

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export function getPasswordChecks(
  requirements: PasswordRequirements = PASSWORD_REQUIREMENTS
): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    {
      label: `At least ${requirements.minLength} characters`,
      test: (p) => p.length >= requirements.minLength,
    },
  ];

  if (requirements.requireUppercase) {
    checks.push({
      label: 'Contains uppercase letter',
      test: (p) => /[A-Z]/.test(p),
    });
  }

  if (requirements.requireNumber) {
    checks.push({
      label: 'Contains number',
      test: (p) => /[0-9]/.test(p),
    });
  }

  if (requirements.requireSpecialChar) {
    checks.push({
      label: 'Contains special character',
      test: (p) => SPECIAL_CHAR_REGEX.test(p),
    });
  }

  return checks;
}
