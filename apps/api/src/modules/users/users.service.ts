import type { UserRole } from '@jovandyaz/auth';
import { Injectable, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import { UsersRepository } from './users.repository';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  provider?: string;
  providerId?: string;
  avatarUrl?: string;
  isAnonymous?: boolean;
}

export interface UpdateUserData {
  name?: string;
  avatarUrl?: string;
  locale?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly i18n: I18nService
  ) {}

  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }
    return user;
  }

  async findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async findByProviderAndProviderId(provider: string, providerId: string) {
    return this.usersRepository.findByProviderAndProviderId(
      provider,
      providerId
    );
  }

  async create(data: CreateUserData) {
    return this.usersRepository.create({
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      provider: data.provider ?? 'local',
      providerId: data.providerId,
      avatarUrl: data.avatarUrl,
      ...(data.isAnonymous && { isAnonymous: true }),
    });
  }

  async update(id: string, data: UpdateUserData) {
    const user = await this.usersRepository.update(id, data);

    if (!user) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }

    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    const user = await this.usersRepository.update(id, { passwordHash });

    if (!user) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }

    return user;
  }

  async markEmailVerified(id: string) {
    const user = await this.usersRepository.update(id, {
      emailVerifiedAt: new Date(),
    });

    if (!user) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }

    return user;
  }

  async findAll() {
    return this.usersRepository.findAll();
  }

  async updateRole(id: string, role: UserRole) {
    const user = await this.usersRepository.updateRole(id, role);
    if (!user) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }
    return user;
  }

  sanitizeUser(user: Awaited<ReturnType<typeof this.findById>>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
