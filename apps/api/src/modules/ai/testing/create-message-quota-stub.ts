import { vi } from 'vitest';

import type {
  MessageQuotaService,
  QuotaConsumeOutcome,
} from '../application/services/message-quota.service';

/** A quota that meters nothing unless told otherwise; read calls with `vi.mocked(stub.consume)`. */
export function createMessageQuotaStub(
  outcome: QuotaConsumeOutcome = { kind: 'unmetered' }
): MessageQuotaService {
  return {
    consume: vi.fn().mockResolvedValue(outcome),
    refund: vi.fn().mockResolvedValue(null),
    snapshot: vi.fn(),
  } as unknown as MessageQuotaService;
}
