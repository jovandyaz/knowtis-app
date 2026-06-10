import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import { WebhookAlertService } from '../infrastructure/alerting/webhook-alert.service';
import { FallbackChainService } from '../infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from '../infrastructure/providers/provider-registry.factory';
import { createMockConfig } from './create-mock-config';
import { createTestCatalog } from './create-test-catalog';

export function createTestChain(
  config: ConfigService<EnvConfig, true> = createMockConfig()
) {
  const registry = new ProviderRegistryFactory(config);
  registry.onModuleInit();
  const chain = new FallbackChainService(
    config,
    registry,
    createTestCatalog(),
    new WebhookAlertService(config)
  );
  chain.onModuleInit();
  return { registry, chain };
}
