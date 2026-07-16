import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAuditService } from '../../admin/audit/admin-audit.service';
import {
  FEATURE_FLAG_REPOSITORY,
  type FeatureFlagEntity,
  type FeatureFlagRepository,
} from '../domain/feature-flag.repository';
import { FeatureFlagsService } from '../feature-flags.service';

const ACTOR_ID = 'actor-1';

function createMockFlag(
  overrides: Partial<FeatureFlagEntity> = {}
): FeatureFlagEntity {
  return {
    key: 'test_flag',
    enabled: true,
    description: 'A test flag',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let repository: Record<keyof FeatureFlagRepository, ReturnType<typeof vi.fn>>;
  let cache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let adminAuditService: { record: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = {
      findByKey: vi.fn(),
      findAll: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };

    cache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };

    adminAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: FEATURE_FLAG_REPOSITORY, useValue: repository },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: AdminAuditService, useValue: adminAuditService },
      ],
    }).compile();

    service = module.get(FeatureFlagsService);
  });

  describe('isEnabled', () => {
    it('should return cached value without calling repository', async () => {
      cache.get.mockResolvedValue(true);

      const result = await service.isEnabled('test_flag');

      expect(result).toBe(true);
      expect(cache.get).toHaveBeenCalledWith('ff:test_flag');
      expect(repository.findByKey).not.toHaveBeenCalled();
    });

    it('should query repository on cache miss and cache the result', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findByKey.mockResolvedValue(createMockFlag({ enabled: true }));

      const result = await service.isEnabled('test_flag');

      expect(result).toBe(true);
      expect(repository.findByKey).toHaveBeenCalledWith('test_flag');
      expect(cache.set).toHaveBeenCalledWith('ff:test_flag', true, 30000);
    });

    it('should return false when flag is not found in DB', async () => {
      cache.get.mockResolvedValue(undefined);
      repository.findByKey.mockResolvedValue(null);

      const result = await service.isEnabled('nonexistent');

      expect(result).toBe(false);
      expect(cache.set).toHaveBeenCalledWith('ff:nonexistent', false, 30000);
    });
  });

  describe('toggle', () => {
    it('should upsert flag and invalidate cache', async () => {
      const flag = createMockFlag({ enabled: true });
      repository.findByKey.mockResolvedValue(
        createMockFlag({ enabled: false })
      );
      repository.upsert.mockResolvedValue(flag);

      const result = await service.toggle('test_flag', true, ACTOR_ID, 'desc');

      expect(result).toEqual(flag);
      expect(repository.upsert).toHaveBeenCalledWith({
        key: 'test_flag',
        enabled: true,
        description: 'desc',
      });
      expect(cache.del).toHaveBeenCalledWith('ff:test_flag');
    });

    it('records flag.updated with before/after enabled values when toggling an existing flag', async () => {
      const previous = createMockFlag({ enabled: false, description: 'desc' });
      const flag = createMockFlag({ enabled: true, description: 'desc' });
      repository.findByKey.mockResolvedValue(previous);
      repository.upsert.mockResolvedValue(flag);

      await service.toggle('test_flag', true, ACTOR_ID, 'desc');

      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'flag.updated',
        targetType: 'feature_flag',
        targetId: 'test_flag',
        before: { enabled: false },
        after: { enabled: true },
      });
    });

    it('includes description in before/after only when it changed', async () => {
      const previous = createMockFlag({
        enabled: true,
        description: 'old desc',
      });
      const flag = createMockFlag({ enabled: true, description: 'new desc' });
      repository.findByKey.mockResolvedValue(previous);
      repository.upsert.mockResolvedValue(flag);

      await service.toggle('test_flag', true, ACTOR_ID, 'new desc');

      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'flag.updated',
        targetType: 'feature_flag',
        targetId: 'test_flag',
        before: { enabled: true, description: 'old desc' },
        after: { enabled: true, description: 'new desc' },
      });
    });

    it('records a description transition from null to a set value', async () => {
      const previous = createMockFlag({ enabled: false, description: null });
      const flag = createMockFlag({ enabled: true, description: 'new desc' });
      repository.findByKey.mockResolvedValue(previous);
      repository.upsert.mockResolvedValue(flag);

      await service.toggle('test_flag', true, ACTOR_ID, 'new desc');

      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'flag.updated',
        targetType: 'feature_flag',
        targetId: 'test_flag',
        before: { enabled: false, description: null },
        after: { enabled: true, description: 'new desc' },
      });
    });

    it('omits the before key when toggling a new flag', async () => {
      const flag = createMockFlag({ enabled: true, description: 'desc' });
      repository.findByKey.mockResolvedValue(null);
      repository.upsert.mockResolvedValue(flag);

      await service.toggle('test_flag', true, ACTOR_ID, 'desc');

      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'flag.updated',
        targetType: 'feature_flag',
        targetId: 'test_flag',
        after: { enabled: true, description: 'desc' },
      });
      expect(adminAuditService.record.mock.calls[0][0]).not.toHaveProperty(
        'before'
      );
    });
  });

  describe('getAll', () => {
    it('should delegate to repository', async () => {
      const flags = [createMockFlag(), createMockFlag({ key: 'other' })];
      repository.findAll.mockResolvedValue(flags);

      const result = await service.getAll();

      expect(result).toEqual(flags);
      expect(repository.findAll).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete flag and invalidate cache', async () => {
      const existing = createMockFlag();
      repository.findByKey.mockResolvedValue(existing);
      repository.delete.mockResolvedValue(undefined);

      await service.remove('test_flag', ACTOR_ID);

      expect(repository.delete).toHaveBeenCalledWith('test_flag');
      expect(cache.del).toHaveBeenCalledWith('ff:test_flag');
    });

    it('records flag.deleted with before state and no after when removing an existing flag', async () => {
      const existing = createMockFlag({ enabled: true, description: 'desc' });
      repository.findByKey.mockResolvedValue(existing);

      await service.remove('test_flag', ACTOR_ID);

      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        action: 'flag.deleted',
        targetType: 'feature_flag',
        targetId: 'test_flag',
        before: { enabled: true, description: 'desc' },
      });
    });

    it('deletes nothing and records nothing when removing a nonexistent flag', async () => {
      repository.findByKey.mockResolvedValue(null);

      await service.remove('missing_flag', ACTOR_ID);

      expect(repository.delete).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
      expect(adminAuditService.record).not.toHaveBeenCalled();
    });
  });
});
