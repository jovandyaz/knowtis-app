import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATABASE_CONNECTION, featureFlags } from '../../../database';
import type { FeatureFlagEntity } from '../domain/feature-flag.repository';
import { DrizzleFeatureFlagRepository } from '../infrastructure/drizzle-feature-flag.repository';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
}));

function createMockRow(
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

function createChainedMock(result: unknown[] = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe('DrizzleFeatureFlagRepository', () => {
  let repository: DrizzleFeatureFlagRepository;
  let db: ReturnType<typeof createChainedMock>;

  beforeEach(async () => {
    db = createChainedMock();

    const module = await Test.createTestingModule({
      providers: [
        DrizzleFeatureFlagRepository,
        { provide: DATABASE_CONNECTION, useValue: db },
      ],
    }).compile();

    repository = module.get(DrizzleFeatureFlagRepository);
  });

  describe('findByKey', () => {
    it('should return null when flag is not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repository.findByKey('nonexistent');

      expect(result).toBeNull();
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalledWith(featureFlags);
      expect(db.where).toHaveBeenCalledWith(
        eq(featureFlags.key, 'nonexistent')
      );
      expect(db.limit).toHaveBeenCalledWith(1);
    });

    it('should return entity when flag is found', async () => {
      const row = createMockRow();
      db.limit.mockResolvedValue([row]);

      const result = await repository.findByKey('test_flag');

      expect(result).toEqual({
        key: 'test_flag',
        enabled: true,
        description: 'A test flag',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      });
      expect(db.where).toHaveBeenCalledWith(eq(featureFlags.key, 'test_flag'));
    });
  });

  describe('findAll', () => {
    it('should return an array of entities', async () => {
      const rows = [
        createMockRow(),
        createMockRow({ key: 'other_flag', enabled: false }),
      ];
      db.from.mockResolvedValue(rows);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('test_flag');
      expect(result[1].key).toBe('other_flag');
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalledWith(featureFlags);
    });

    it('should return empty array when no flags exist', async () => {
      db.from.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should call db.delete with correct where clause', async () => {
      db.where.mockResolvedValue(undefined);

      await repository.delete('test_flag');

      expect(db.delete).toHaveBeenCalledWith(featureFlags);
      expect(db.where).toHaveBeenCalledWith(eq(featureFlags.key, 'test_flag'));
    });
  });
});
