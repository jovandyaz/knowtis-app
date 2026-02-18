export {
  RequirePermission,
  REQUIRE_PERMISSION_KEY,
} from './lib/require-permission.decorator';
export type { PolicyHandler } from './lib/require-permission.decorator';

export {
  PoliciesGuard,
  ABILITY_FACTORY_KEY,
  REQUEST_EXTRACTOR_KEY,
} from './lib/policies.guard';
export type { AbilityFactory, RequestExtractor } from './lib/policies.guard';
