import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

const USER = {
  id: 'user-1',
  email: 'ana@test.com',
  name: 'Ana',
  passwordHash: 'hash',
};

function createMockRepository() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByProviderAndProviderId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateRole: vi.fn(),
  };
}

describe('UsersService', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let service: UsersService;

  beforeEach(() => {
    repository = createMockRepository();
    service = new UsersService(repository as unknown as UsersRepository);
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      repository.findById.mockResolvedValue(USER);
      await expect(service.findById('user-1')).resolves.toEqual(USER);
    });

    it('returns null when the user does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('returns null when the user does not exist', async () => {
      repository.update.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'New' })
      ).resolves.toBeNull();
    });
  });

  describe('updatePasswordHash', () => {
    it('returns null when the user does not exist', async () => {
      repository.update.mockResolvedValue(null);
      await expect(
        service.updatePasswordHash('missing', 'hash')
      ).resolves.toBeNull();
    });
  });

  describe('markEmailVerified', () => {
    it('returns null when the user does not exist', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.markEmailVerified('missing')).resolves.toBeNull();
    });
  });

  describe('updateRole', () => {
    it('returns null when the user does not exist', async () => {
      repository.updateRole.mockResolvedValue(null);
      await expect(service.updateRole('missing', 'admin')).resolves.toBeNull();
    });
  });

  describe('sanitizeUser', () => {
    it('strips the password hash', () => {
      const sanitized = service.sanitizeUser(
        USER as Parameters<UsersService['sanitizeUser']>[0]
      );
      expect(sanitized).not.toHaveProperty('passwordHash');
      expect(sanitized).toMatchObject({ id: 'user-1', email: 'ana@test.com' });
    });
  });
});
