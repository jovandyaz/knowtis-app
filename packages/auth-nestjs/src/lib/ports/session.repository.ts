import type { AuthDomainError } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface SessionEntity {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly refreshTokenHash: string;
  readonly rotatedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreateSessionData {
  readonly userId: string;
  readonly familyId: string;
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
  hasLiveSessionForFamily(familyId: string): Promise<boolean>;
  markRotated(id: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByFamilyId(familyId: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
  deleteAllByUserIdExceptFamily(
    userId: string,
    familyId: string
  ): Promise<void>;
  deleteRotatedBefore(cutoff: Date): Promise<void>;
}
