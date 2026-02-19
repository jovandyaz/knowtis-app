import type { AuthDomainError } from '@jovandyaz/auth';
import type { Result } from 'neverthrow';

export interface SessionEntity {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreateSessionData {
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly userAgent?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly expiresAt: Date;
}

export interface SessionRepository {
  create(
    data: CreateSessionData
  ): Promise<Result<SessionEntity, AuthDomainError>>;
  findByRefreshTokenHash(hash: string): Promise<SessionEntity | null>;
  deleteById(id: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
}
