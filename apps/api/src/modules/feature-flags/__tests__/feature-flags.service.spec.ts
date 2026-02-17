import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FEATURE_FLAG_REPOSITORY,
  type FeatureFlagEntity,
  type FeatureFlagRepository,
} from '../domain/feature-flag.repository';
import { FeatureFlagsService } from '../feature-flags.service';

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

    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: FEATURE_FLAG_REPOSITORY, useValue: repository },
        { provide: CACHE_MANAGER, useValue: cache },
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
      repository.upsert.mockResolvedValue(flag);

      const result = await service.toggle('test_flag', true, 'desc');

      expect(result).toEqual(flag);
      expect(repository.upsert).toHaveBeenCalledWith({
        key: 'test_flag',
        enabled: true,
        description: 'desc',
      });
      expect(cache.del).toHaveBeenCalledWith('ff:test_flag');
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
      repository.delete.mockResolvedValue(undefined);

      await service.remove('test_flag');

      expect(repository.delete).toHaveBeenCalledWith('test_flag');
      expect(cache.del).toHaveBeenCalledWith('ff:test_flag');
    });
  });
});
