import type { RequestUser } from '@jovandyaz/auth/server';
import { NotFoundException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersController } from '../users.controller';
import type { UsersService } from '../users.service';

const CURRENT_USER = {
  id: 'user-1',
  email: 'ana@test.com',
  name: 'Ana',
  role: 'user',
} as unknown as RequestUser;

function createMockUsersService() {
  return {
    update: vi.fn(),
    sanitizeUser: vi.fn(
      ({
        passwordHash: _passwordHash,
        ...rest
      }: Record<string, unknown> & { passwordHash: string | null }) => rest
    ),
  };
}

describe('UsersController', () => {
  let usersService: ReturnType<typeof createMockUsersService>;
  let i18n: { t: ReturnType<typeof vi.fn> };
  let controller: UsersController;

  beforeEach(() => {
    usersService = createMockUsersService();
    i18n = { t: vi.fn().mockReturnValue('User not found') };
    controller = new UsersController(
      usersService as unknown as UsersService,
      i18n as unknown as I18nService
    );
  });

  it('returns the sanitized updated user', async () => {
    usersService.update.mockResolvedValue({
      id: 'user-1',
      email: 'ana@test.com',
      name: 'Ana Updated',
      passwordHash: 'hash',
    });

    const result = await controller.updateProfile(CURRENT_USER, {
      name: 'Ana Updated',
    });

    expect(result.user).toMatchObject({ name: 'Ana Updated' });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('throws NotFoundException when the user no longer exists', async () => {
    usersService.update.mockResolvedValue(null);

    await expect(
      controller.updateProfile(CURRENT_USER, { name: 'X' })
    ).rejects.toThrow(NotFoundException);
    expect(i18n.t).toHaveBeenCalledWith('validation.USER_NOT_FOUND');
  });
});
