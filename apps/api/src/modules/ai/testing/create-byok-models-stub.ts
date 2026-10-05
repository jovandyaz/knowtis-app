import { vi, type Mock } from 'vitest';

import type { ByokModelsService } from '../application/services/byok-models.service';
import { NO_ENTITLEMENTS } from '../domain/model-catalog/byok-entitlement';

/** A BYOK models service whose caller is entitled to every route; read calls, or override what it resolves, through `stub.entitlementsFor.mock`. */
export function createByokModelsStub(): {
  readonly entitlementsFor: Mock<ByokModelsService['entitlementsFor']>;
} {
  return {
    entitlementsFor: vi
      .fn<ByokModelsService['entitlementsFor']>()
      .mockResolvedValue(NO_ENTITLEMENTS),
  };
}
