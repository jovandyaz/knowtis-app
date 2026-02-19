import type { AuthDomainError, Email, UserId } from '@jovandyaz/auth';
import type { Result } from 'neverthrow';

export interface UserEntity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly passwordHash: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserData {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
}

export interface UserRepository {
  findByEmail(email: Email): Promise<UserEntity | null>;
  findById(id: UserId): Promise<UserEntity | null>;
  create(data: CreateUserData): Promise<Result<UserEntity, AuthDomainError>>;
  emailExists(email: Email): Promise<boolean>;
  updatePasswordHash(
    userId: UserId,
    passwordHash: string
  ): Promise<Result<void, AuthDomainError>>;
  markEmailVerified(userId: UserId): Promise<Result<void, AuthDomainError>>;
}

export { USER_REPOSITORY } from '../constants';
