import type { AuthDomainError } from '@jovandyaz/auth';
import type { Result } from 'neverthrow';

export interface PasswordResetTokenEntity {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreatePasswordResetTokenData {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  create(
    data: CreatePasswordResetTokenData
  ): Promise<Result<PasswordResetTokenEntity, AuthDomainError>>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  deleteAllByUserId(userId: string): Promise<void>;
}
