import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import { WebhookAlertService } from '../infrastructure/alerting/webhook-alert.service';
import {
  FallbackChainService,
  type FallbackChainSource,
} from '../infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from '../infrastructure/providers/provider-registry.factory';
import { createMockConfig } from './create-mock-config';
import { createTestCatalog } from './create-test-catalog';

export function createTestChain(
  config: ConfigService<EnvConfig, true> = createMockConfig()
) {
  const registry = new ProviderRegistryFactory(config);
  registry.onModuleInit();
  const chainSource: FallbackChainSource = {
    getFallbackChain: async () =>
      config
        .get('AI_FALLBACK_CHAIN')
        .split(',')
        .map((entry: string) => entry.trim())
        .filter((entry: string) => entry.length > 0),
  };
  const chain = new FallbackChainService(
    chainSource,
    config,
    registry,
    createTestCatalog(),
    new WebhookAlertService(config)
  );
  chain.onModuleInit();
  return { registry, chain };
}
