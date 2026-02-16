import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../errors/auth.errors';
import type { UserId } from '../value-objects/user-id.vo';

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

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
