import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';
import type { UserId } from '../../../../auth/src/lib/value-objects/user-id.vo';

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
