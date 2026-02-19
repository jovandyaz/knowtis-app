import type { AuthDomainError } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

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
