import type { AuthDomainError, UserId } from '@jovandyaz/auth';
import type { Result } from 'neverthrow';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
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

export { TOKEN_SERVICE } from '../constants';
