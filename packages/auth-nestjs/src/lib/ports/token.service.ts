import type {
  AuthDomainError,
  AuthTokens,
  UserId,
} from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly iat?: number;
  readonly exp?: number;
}

export interface TokenService {
  generateTokens(
    userId: UserId,
    email: string
  ): Promise<Result<AuthTokens, AuthDomainError>>;

  verifyRefreshToken(
    token: string
  ): Promise<Result<JwtPayload, AuthDomainError>>;
}
