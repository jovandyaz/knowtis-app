import { Injectable, NotFoundException } from '@nestjs/common';

import { UsersRepository } from './users.repository';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  provider?: string;
  providerId?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
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
    });
  }

  async update(id: string, data: Partial<CreateUserData>) {
    const updateData: Record<string, string> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const user = await this.usersRepository.update(id, updateData);

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    const user = await this.usersRepository.update(id, { passwordHash });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  async markEmailVerified(id: string) {
    const user = await this.usersRepository.update(id, {
      emailVerifiedAt: new Date(),
    });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  sanitizeUser(user: Awaited<ReturnType<typeof this.findById>>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
