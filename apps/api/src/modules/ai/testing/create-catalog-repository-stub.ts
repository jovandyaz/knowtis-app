import { vi } from 'vitest';

import type { AiCatalogRepository } from '../domain/ports/ai-catalog.repository';

export function createCatalogRepositoryStub(
  listByStatus: AiCatalogRepository['listByStatus']
): AiCatalogRepository {
  return {
    listByStatus: vi.fn(listByStatus),
    upsertCandidate: vi.fn(),
    setStatus: vi.fn(),
    updateCopy: vi.fn(),
    listAlerts: vi.fn(),
    createAlert: vi.fn(),
    resolveAlert: vi.fn().mockResolvedValue(true),
  };
}
