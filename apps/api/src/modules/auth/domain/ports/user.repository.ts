import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../errors/auth.errors';
import type { Email } from '../value-objects/email.vo';
import type { UserId } from '../value-objects/user-id.vo';

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

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
