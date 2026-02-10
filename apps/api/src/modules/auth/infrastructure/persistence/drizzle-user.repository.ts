import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { UsersService } from '../../../users';
import {
  AuthErrors,
  USER_REPOSITORY,
  type AuthDomainError,
  type CreateUserData,
  type Email,
  type UserEntity,
  type UserId,
  type UserRepository,
} from '../../domain';

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
      return this.mapToEntity(user);
    } catch (error) {
      this.logger.error(
        `Failed to find user by id ${id.value}`,
        error instanceof Error ? error.stack : error
      );
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(AuthErrors.internalError(message));
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
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      passwordHash: user.passwordHash ?? '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export { USER_REPOSITORY };
