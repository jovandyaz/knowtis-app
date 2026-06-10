import type { UserRole } from '@jovandyaz/auth';
import { Injectable } from '@nestjs/common';

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
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string) {
    return this.usersRepository.findById(id);
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
    return this.usersRepository.update(id, data);
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    return this.usersRepository.update(id, { passwordHash });
  }

  async markEmailVerified(id: string) {
    return this.usersRepository.update(id, { emailVerifiedAt: new Date() });
  }

  async findAll() {
    return this.usersRepository.findAll();
  }

  async updateRole(id: string, role: UserRole) {
    return this.usersRepository.updateRole(id, role);
  }

  sanitizeUser(
    user: NonNullable<Awaited<ReturnType<UsersRepository['findById']>>>
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
