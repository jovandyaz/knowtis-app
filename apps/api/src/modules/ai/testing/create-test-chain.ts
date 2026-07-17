import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import { parseChain } from '../domain/ai-settings';
import { WebhookAlertService } from '../infrastructure/alerting/webhook-alert.service';
import {
  FallbackChainService,
  type FallbackChainSource,
} from '../infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from '../infrastructure/providers/provider-registry.factory';
import { createMockConfig } from './create-mock-config';

/** Catalog-compatible fallback chain for tests — the openrouter code default has no pricing in createTestCatalog. */
export const TEST_FALLBACK_CHAIN =
  'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini,google:gemini-2.0-flash';

export function createTestChain(
  config: ConfigService<EnvConfig, true> = createMockConfig(),
  fallbackChain: string = TEST_FALLBACK_CHAIN
) {
  const registry = new ProviderRegistryFactory(config);
  registry.onModuleInit();
  const chainModels = parseChain(fallbackChain);
  const chainSource: FallbackChainSource = {
    getFallbackChain: async () => chainModels,
  };
  const chain = new FallbackChainService(
    chainSource,
    config,
    registry,
    new WebhookAlertService(config)
  );
  chain.onModuleInit(chainModels);
  return { registry, chain };
}
