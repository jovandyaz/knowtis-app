import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';

export interface EmailVerificationTokenEntity {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreateEmailVerificationTokenData {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface EmailVerificationTokenRepository {
  create(
    data: CreateEmailVerificationTokenData
  ): Promise<Result<EmailVerificationTokenEntity, AuthDomainError>>;
  findByTokenHash(
    tokenHash: string
  ): Promise<EmailVerificationTokenEntity | null>;
  deleteAllByUserId(userId: string): Promise<void>;
}

export { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from '../constants';
