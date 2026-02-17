import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagEntity } from '../domain/feature-flag.repository';
import { FeatureFlagsController } from '../feature-flags.controller';
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

describe('FeatureFlagsController', () => {
  let controller: FeatureFlagsController;
  let service: {
    getAll: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getAll: vi.fn(),
      toggle: vi.fn(),
      remove: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [FeatureFlagsController],
      providers: [{ provide: FeatureFlagsService, useValue: service }],
    }).compile();

    controller = module.get(FeatureFlagsController);
  });

  describe('getAll', () => {
    it('should return all feature flags', async () => {
      const flags = [
        createMockFlag(),
        createMockFlag({ key: 'other_flag', enabled: false }),
      ];
      service.getAll.mockResolvedValue(flags);

      const result = await controller.getAll();

      expect(result).toEqual(flags);
      expect(service.getAll).toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('should toggle a feature flag', async () => {
      const flag = createMockFlag({ enabled: true });
      service.toggle.mockResolvedValue(flag);

      const result = await controller.upsert(
        { key: 'test_flag' },
        {
          enabled: true,
          description: 'A test flag',
        }
      );

      expect(result).toEqual(flag);
      expect(service.toggle).toHaveBeenCalledWith(
        'test_flag',
        true,
        'A test flag'
      );
    });

    it('should toggle without description', async () => {
      const flag = createMockFlag({ enabled: false, description: null });
      service.toggle.mockResolvedValue(flag);

      const result = await controller.upsert(
        { key: 'test_flag' },
        { enabled: false }
      );

      expect(result).toEqual(flag);
      expect(service.toggle).toHaveBeenCalledWith(
        'test_flag',
        false,
        undefined
      );
    });
  });

  describe('remove', () => {
    it('should remove a feature flag', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove({ key: 'test_flag' });

      expect(service.remove).toHaveBeenCalledWith('test_flag');
    });
  });
});
