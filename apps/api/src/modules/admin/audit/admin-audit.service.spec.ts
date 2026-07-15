import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { AdminAuditService } from './admin-audit.service';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
  type NewAdminAuditEntry,
} from './domain/admin-audit.repository';

function createEntry(
  overrides: Partial<NewAdminAuditEntry> = {}
): NewAdminAuditEntry {
  return {
    actorId: 'actor-1',
    action: 'user.role.updated',
    targetType: 'user',
    targetId: 'target-1',
    ...overrides,
  };
}

describe('AdminAuditService', () => {
  let service: AdminAuditService;
  let repository: Record<keyof AdminAuditRepository, ReturnType<typeof vi.fn>>;
  let loggerErrorSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    repository = {
      insert: vi.fn(),
      findPaginated: vi.fn(),
    };

    loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: ADMIN_AUDIT_REPOSITORY, useValue: repository },
      ],
    }).compile();

    service = module.get(AdminAuditService);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('record', () => {
    it('forwards the entry to the repository', async () => {
      repository.insert.mockResolvedValue(undefined);
      const entry = createEntry();

      await service.record(entry);

      expect(repository.insert).toHaveBeenCalledWith(entry);
    });

    it('resolves without throwing and logs when the repository rejects', async () => {
      const error = new Error('insert failed');
      repository.insert.mockRejectedValue(error);
      const entry = createEntry();

      await expect(service.record(entry)).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('findPaginated', () => {
    it('passes page and limit through to the repository and returns its result', async () => {
      const page = { items: [], total: 0 };
      repository.findPaginated.mockResolvedValue(page);

      const result = await service.findPaginated({ page: 2, limit: 10 });

      expect(repository.findPaginated).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
      });
      expect(result).toBe(page);
    });
  });
});
