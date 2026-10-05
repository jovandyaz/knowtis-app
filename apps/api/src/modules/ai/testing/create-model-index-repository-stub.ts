import { vi } from 'vitest';

import type { ModelIndexRepository } from '../domain/ports/model-index.repository';

export function createModelIndexRepositoryStub(
  listListed: ModelIndexRepository['listListed']
): ModelIndexRepository {
  return {
    listListed: vi.fn(listListed),
    upsertMany: vi.fn(),
    markAbsent: vi.fn(),
    lastSeenAt: vi.fn(),
  };
}
