import { vi, type Mock } from 'vitest';

import type { ByokModelsService } from '../application/services/byok-models.service';
import {
  NO_ENTITLEMENTS,
  type ByokEntitlements,
} from '../domain/model-catalog/byok-entitlement';

/** A BYOK models service whose caller is entitled to `entitlements`, every route by default; read calls with `stub.entitlementsFor.mock`. */
export function createByokModelsStub(
  entitlements: ByokEntitlements = NO_ENTITLEMENTS
): { readonly entitlementsFor: Mock<ByokModelsService['entitlementsFor']> } {
  return {
    entitlementsFor: vi
      .fn<ByokModelsService['entitlementsFor']>()
      .mockResolvedValue(entitlements),
  };
}
