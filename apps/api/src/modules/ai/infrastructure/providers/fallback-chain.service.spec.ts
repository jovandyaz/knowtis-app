import { describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { TEST_FALLBACK_CHAIN } from '../../testing/create-test-chain';
import { WebhookAlertService } from '../alerting/webhook-alert.service';
import {
  FallbackChainService,
  type FallbackChainSource,
} from './fallback-chain.service';
import { ProviderRegistryFactory } from './provider-registry.factory';

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn()) }));
vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn(() => vi.fn()),
}));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn()) }));

const TEST_CHAIN_MODELS = TEST_FALLBACK_CHAIN.split(',');

function buildService(configOverrides: Record<string, unknown> = {}) {
  const config = createMockConfig(configOverrides);
  const registry = new ProviderRegistryFactory(config);
  registry.onModuleInit();
  const alerts = { notify: vi.fn() } as unknown as WebhookAlertService;
  const chainSource: FallbackChainSource = {
    getFallbackChain: async () => TEST_CHAIN_MODELS,
  };
  const service = new FallbackChainService(
    chainSource,
    config,
    registry,
    alerts
  );
  service.onModuleInit(TEST_CHAIN_MODELS);
  return { service, alerts };
}

describe('FallbackChainService', () => {
  describe('healthSnapshot', () => {
    it('should report every chain provider with configured status and no cooldown state', () => {
      const { service } = buildService({ OPENAI_API_KEY: 'test-key' });

      const snapshot = service.healthSnapshot();

      expect(Object.keys(snapshot).sort()).toEqual([
        'anthropic',
        'google',
        'openai',
        'openrouter',
      ]);
      expect(snapshot['anthropic']).toEqual({
        configured: true,
        cooling: false,
        failureCount: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        cooldownEndsAt: null,
      });
      expect(snapshot['openai']?.configured).toBe(true);
      expect(snapshot['google']?.configured).toBe(false);
      expect(snapshot['openrouter']?.configured).toBe(false);
    });

    it('should expose cooldown state after repeated provider failures', () => {
      const { service } = buildService({ AI_COOLDOWN_ALLOWED_FAILS: 2 });

      service.cooldown.recordFailure('anthropic');
      service.cooldown.recordFailure('anthropic');

      const snapshot = service.healthSnapshot();
      expect(snapshot['anthropic']?.cooling).toBe(true);
      expect(snapshot['anthropic']?.failureCount).toBe(2);
      expect(snapshot['anthropic']?.lastFailureAt).toEqual(expect.any(String));
      expect(snapshot['anthropic']?.cooldownEndsAt).toEqual(expect.any(String));
    });

    it('rolls a cooling OpenRouter model up into the provider-level row', () => {
      const { service } = buildService({ AI_COOLDOWN_ALLOWED_FAILS: 2 });

      service.cooldown.recordFailure('openrouter:z-ai/glm-5.2');
      service.cooldown.recordFailure('openrouter:z-ai/glm-5.2');

      const snapshot = service.healthSnapshot();
      expect(snapshot['openrouter']?.cooling).toBe(true);
      expect(snapshot['openrouter']?.failureCount).toBe(2);
    });
  });

  describe('cooldown alerting', () => {
    it('should notify the webhook when a provider enters cooldown', () => {
      const { service, alerts } = buildService({
        AI_COOLDOWN_ALLOWED_FAILS: 1,
      });

      service.cooldown.recordFailure('openai');

      expect(alerts.notify).toHaveBeenCalledWith(
        'cooldown_start',
        expect.objectContaining({ provider: 'openai' })
      );
    });

    it('should not notify on failures below the cooldown threshold', () => {
      const { service, alerts } = buildService({
        AI_COOLDOWN_ALLOWED_FAILS: 3,
      });

      service.cooldown.recordFailure('openai');

      expect(alerts.notify).not.toHaveBeenCalled();
    });
  });

  describe('candidatesFor', () => {
    function buildWithSource(
      getFallbackChain: () => Promise<string[]>,
      configOverrides: Record<string, unknown> = {}
    ) {
      const config = createMockConfig(configOverrides);
      const registry = new ProviderRegistryFactory(config);
      registry.onModuleInit();
      const alerts = { notify: vi.fn() } as unknown as WebhookAlertService;
      const chainSource: FallbackChainSource = {
        getFallbackChain: vi.fn(getFallbackChain),
      };
      const service = new FallbackChainService(
        chainSource,
        config,
        registry,
        alerts
      );
      service.onModuleInit(TEST_CHAIN_MODELS);
      return { service, chainSource };
    }

    it('should place the primary model first in the candidate list', () => {
      const { service } = buildService();

      const candidates = service.candidatesFor('anthropic:claude-sonnet-5');

      expect(candidates[0]).toBe('anthropic:claude-sonnet-5');
    });

    // With OpenAI credentialed, only the scope can keep gpt-4o-mini out —
    // the default mock config would mask a dropped scope behind the
    // credential filter.
    it('should confine candidates to the primary provider when the caller scopes it', () => {
      const { service } = buildWithSource(async () => TEST_CHAIN_MODELS, {
        OPENAI_API_KEY: 'test-key',
      });

      const candidates = service.candidatesFor(
        'anthropic:claude-sonnet-5',
        'same-family'
      );

      expect(candidates).toEqual([
        'anthropic:claude-sonnet-5',
        'anthropic:claude-haiku-4-5',
      ]);
    });

    it('should apply a runtime chain override from the source after the first request', async () => {
      // The anthropic-only override drops openai:gpt-4o-mini from the env seed.
      const { service, chainSource } = buildWithSource(
        async () => ['anthropic:claude-haiku-4-5'],
        { OPENAI_API_KEY: 'test-key' }
      );

      service.candidatesFor('anthropic:claude-sonnet-5');
      await vi.waitFor(() => {
        expect(
          service.candidatesFor('anthropic:claude-sonnet-5')
        ).not.toContain('openai:gpt-4o-mini');
      });
      expect(chainSource.getFallbackChain).toHaveBeenCalledTimes(1);
    });

    it('should keep the prior snapshot when the source refresh fails', async () => {
      const { service, chainSource } = buildWithSource(
        async () => {
          throw new Error('DB down');
        },
        { OPENAI_API_KEY: 'test-key' }
      );

      service.candidatesFor('anthropic:claude-sonnet-5');
      await vi.waitFor(() =>
        expect(chainSource.getFallbackChain).toHaveBeenCalledTimes(1)
      );
      expect(service.candidatesFor('anthropic:claude-sonnet-5')).toContain(
        'openai:gpt-4o-mini'
      );
    });

    it('should keep the prior snapshot when the source returns an empty chain', async () => {
      const { service, chainSource } = buildWithSource(async () => [], {
        OPENAI_API_KEY: 'test-key',
      });

      service.candidatesFor('anthropic:claude-sonnet-5');
      await vi.waitFor(() =>
        expect(chainSource.getFallbackChain).toHaveBeenCalledTimes(1)
      );
      expect(service.candidatesFor('anthropic:claude-sonnet-5')).toContain(
        'openai:gpt-4o-mini'
      );
    });

    it('should ignore a stale refresh that resolves after a newer one', async () => {
      vi.useFakeTimers();
      try {
        let resolveStale!: (chain: string[]) => void;
        const stale = new Promise<string[]>((resolve) => {
          resolveStale = resolve;
        });
        const responses = [
          stale,
          Promise.resolve(['anthropic:claude-haiku-4-5']),
        ];
        let call = 0;
        const { service } = buildWithSource(
          () => responses[call++] ?? Promise.resolve([]),
          { OPENAI_API_KEY: 'test-key' }
        );

        service.candidatesFor('anthropic:claude-sonnet-5');
        vi.advanceTimersByTime(31_000);
        service.candidatesFor('anthropic:claude-sonnet-5');
        await vi.advanceTimersByTimeAsync(0);

        resolveStale(['openai:gpt-4o-mini']);
        await vi.advanceTimersByTimeAsync(0);

        expect(
          service.candidatesFor('anthropic:claude-sonnet-5')
        ).not.toContain('openai:gpt-4o-mini');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should coalesce rapid calls into a single refresh within the TTL', () => {
      const { service, chainSource } = buildWithSource(
        async () => ['anthropic:claude-haiku-4-5'],
        { OPENAI_API_KEY: 'test-key' }
      );

      service.candidatesFor('anthropic:claude-sonnet-5');
      service.candidatesFor('anthropic:claude-sonnet-5');

      expect(chainSource.getFallbackChain).toHaveBeenCalledTimes(1);
    });
  });
});
