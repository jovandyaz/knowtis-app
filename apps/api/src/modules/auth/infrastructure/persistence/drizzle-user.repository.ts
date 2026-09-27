import type {
  CreateUserData,
  UserEntity,
  UserRepository,
} from '@jovandyaz/auth-nestjs';
import { AuthErrors } from '@jovandyaz/auth/server';
import type {
  AuthDomainError,
  Email,
  UserId,
  UserRole,
} from '@jovandyaz/auth/server';
import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { databaseDiagnostics } from '../../../../core/errors/database-diagnostics';
import { UsersService } from '../../../users';

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  private readonly logger = new Logger(DrizzleUserRepository.name);

  constructor(private readonly usersService: UsersService) {}

  async findByEmail(email: Email): Promise<UserEntity | null> {
    const user = await this.usersService.findByEmail(email.value);
    if (!user) {
      return null;
    }

    return this.mapToEntity(user);
  }

  async findById(id: UserId): Promise<UserEntity | null> {
    try {
      const user = await this.usersService.findById(id.value);
      return user ? this.mapToEntity(user) : null;
    } catch (error) {
      this.logger.error({
        operation: 'findUserById',
        userId: id.value,
        ...databaseDiagnostics(error),
      });
      return null;
    }
  }

  async create(
    data: CreateUserData
  ): Promise<Result<UserEntity, AuthDomainError>> {
    try {
      const user = await this.usersService.create({
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
      });

      return ok(this.mapToEntity(user));
    } catch (error) {
      this.logger.error({
        operation: 'createUser',
        ...databaseDiagnostics(error),
      });
      return err(AuthErrors.internalError('Failed to create user'));
    }
  }

  async updatePasswordHash(
    userId: UserId,
    passwordHash: string
  ): Promise<Result<void, AuthDomainError>> {
    try {
      const user = await this.usersService.updatePasswordHash(
        userId.value,
        passwordHash
      );
      if (!user) {
        this.logger.error(
          `Failed to update password hash for user ${userId.value}: user not found`
        );
        return err(AuthErrors.internalError('User not found'));
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error({
        operation: 'updatePasswordHash',
        userId: userId.value,
        ...databaseDiagnostics(error),
      });
      return err(AuthErrors.internalError('Failed to update password hash'));
    }
  }

  async markEmailVerified(
    userId: UserId
  ): Promise<Result<void, AuthDomainError>> {
    try {
      const user = await this.usersService.markEmailVerified(userId.value);
      if (!user) {
        this.logger.error(
          `Failed to mark email verified for user ${userId.value}: user not found`
        );
        return err(AuthErrors.internalError('User not found'));
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error({
        operation: 'markEmailVerified',
        userId: userId.value,
        ...databaseDiagnostics(error),
      });
      return err(AuthErrors.internalError('Failed to mark email verified'));
    }
  }

  async emailExists(email: Email): Promise<boolean> {
    const user = await this.usersService.findByEmail(email.value);
    return user !== null;
  }

  private mapToEntity(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    passwordHash: string | null;
    emailVerifiedAt: Date | null;
    locale: string | null;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      passwordHash: user.passwordHash,
      emailVerifiedAt: user.emailVerifiedAt,
      locale: user.locale,
      role: user.role as UserRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
