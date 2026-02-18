import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';

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

export { SESSION_REPOSITORY } from '../constants';
