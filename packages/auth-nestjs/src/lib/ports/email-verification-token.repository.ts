import type { AuthDomainError } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface EmailVerificationTokenEntity {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly codeHash: string | null;
  readonly codeExpiresAt: Date | null;
  readonly attempts: number;
  readonly createdAt: Date;
}

export interface CreateEmailVerificationTokenData {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly codeHash: string;
  readonly codeExpiresAt: Date;
}

export interface EmailVerificationTokenRepository {
  create(
    data: CreateEmailVerificationTokenData
  ): Promise<Result<EmailVerificationTokenEntity, AuthDomainError>>;
  findByTokenHash(
    tokenHash: string
  ): Promise<EmailVerificationTokenEntity | null>;
  findByUserId(userId: string): Promise<EmailVerificationTokenEntity | null>;
  /** Atomically increments and returns the NEW attempts value; null if row gone. */
  incrementAttempts(id: string): Promise<number | null>;
  deleteAllByUserId(userId: string): Promise<void>;
  deleteExpired(cutoff: Date): Promise<void>;
}
