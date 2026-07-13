import type {
  AuthDomainError,
  AuthTokens,
  UserId,
} from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly isAnonymous?: boolean;
  readonly familyId?: string;
  readonly iss?: string;
  readonly aud?: string | string[];
  /** Set on externally-scoped tokens (e.g. MCP `source: 'mcp'`); absent on session tokens. */
  readonly source?: string;
  readonly iat?: number;
  readonly exp?: number;
}

export interface TokenService {
  generateTokens(
    userId: UserId,
    email: string,
    options?: { isAnonymous?: boolean; familyId?: string }
  ): Promise<Result<AuthTokens, AuthDomainError>>;

  verifyRefreshToken(
    token: string
  ): Promise<Result<JwtPayload, AuthDomainError>>;
}
