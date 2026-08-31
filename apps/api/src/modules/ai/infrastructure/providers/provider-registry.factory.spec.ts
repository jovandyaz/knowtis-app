import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AIProvider } from '@knowtis/shared-types';

import { createMockConfig } from '../../testing/create-mock-config';
import {
  ProviderRegistryFactory,
  type SystemProviderConfig,
  type SystemProviderKeysSource,
} from './provider-registry.factory';

const { languageModel, gatewayLanguageModel, createGateway } = vi.hoisted(
  () => {
    const gatewayLanguageModel = vi.fn().mockReturnValue('mock-gateway-model');
    return {
      languageModel: vi.fn().mockReturnValue('mock-model'),
      gatewayLanguageModel,
      createGateway: vi.fn(() => ({ languageModel: gatewayLanguageModel })),
    };
  }
);

vi.mock('ai', () => ({
  createProviderRegistry: vi.fn(() => ({ languageModel })),
  createGateway,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(),
  createAnthropic: vi.fn(() =>
    vi.fn().mockReturnValue('mock-anthropic-byok-model')
  ),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn(() => vi.fn().mockReturnValue('mock-google-byok-model')),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn().mockReturnValue('mock-openai-byok-model')),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => vi.fn().mockReturnValue('mock-openrouter')),
}));

function makeFactory(
  overrides?: Record<string, unknown>,
  systemKeys?: SystemProviderKeysSource
) {
  const factory = new ProviderRegistryFactory(
    createMockConfig(overrides),
    systemKeys
  );
  factory.onModuleInit();
  return factory;
}

function sourceOf(
  configs: [AIProvider, SystemProviderConfig][]
): SystemProviderKeysSource {
  return {
    getSystemProviderConfigs: vi.fn(async () => new Map(configs)),
  };
}

/** Makes the resolved model name carry the key it was built from, so routing is observable. */
async function routeKeyThroughMocks() {
  const { createProviderRegistry } = vi.mocked(await import('ai'));
  vi.mocked(createAnthropic).mockImplementation(
    ((options: { apiKey: string }) => () =>
      `model-from:${options.apiKey}`) as never
  );
  createProviderRegistry.mockImplementation(((
    providers: Record<string, () => string>
  ) => ({
    languageModel: (id: string) => providers[id.slice(0, id.indexOf(':'))](),
  })) as never);
}

describe('ProviderRegistryFactory', () => {
  it('should resolve a model id through the registry', () => {
    const factory = makeFactory();

    const model = factory.languageModel('anthropic:claude-sonnet-4-20250514');

    expect(model).toBe('mock-model');
    expect(languageModel).toHaveBeenCalledWith(
      'anthropic:claude-sonnet-4-20250514'
    );
  });

  it('should throw when an anthropic model is requested without ANTHROPIC_API_KEY', () => {
    const factory = makeFactory({ ANTHROPIC_API_KEY: '' });

    expect(() =>
      factory.languageModel('anthropic:claude-sonnet-4-20250514')
    ).toThrow("No key for 'anthropic'");
  });

  it('should throw when a google model is requested without GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('google:gemini-2.5-flash')).toThrow(
      "No key for 'google'"
    );
  });

  it('should throw when an openai model is requested without OPENAI_API_KEY', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('openai:gpt-5')).toThrow(
      "No key for 'openai'"
    );
  });

  it('should reject model ids without a provider prefix', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('claude-sonnet-4-20250514')).toThrow(
      "must use the 'provider:model' format"
    );
  });

  it('should reject unknown providers instead of deferring to the registry', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('mistral:mistral-large')).toThrow(
      "Provider 'mistral' is not supported"
    );
    expect(factory.isModelAvailable('mistral:mistral-large')).toBe(false);
  });

  it('should register only anthropic when google and openai keys are absent', async () => {
    const { createProviderRegistry } = vi.mocked(await import('ai'));
    createProviderRegistry.mockClear();

    makeFactory();

    const registered = createProviderRegistry.mock.calls.at(-1)?.[0] ?? {};
    expect(Object.keys(registered)).toEqual(['anthropic']);
  });

  it('should register google and openai providers when their keys are configured', async () => {
    const { createProviderRegistry } = vi.mocked(await import('ai'));
    createProviderRegistry.mockClear();

    makeFactory({
      GOOGLE_GENERATIVE_AI_API_KEY: 'g-key',
      OPENAI_API_KEY: 'o-key',
    });

    const registered = createProviderRegistry.mock.calls.at(-1)?.[0] ?? {};
    expect(Object.keys(registered).sort()).toEqual([
      'anthropic',
      'google',
      'openai',
    ]);
  });

  it('should register openrouter when OPENROUTER_API_KEY is configured', async () => {
    const { createProviderRegistry } = vi.mocked(await import('ai'));
    createProviderRegistry.mockClear();

    makeFactory({ OPENROUTER_API_KEY: 'or-key' });

    const registered = createProviderRegistry.mock.calls.at(-1)?.[0] ?? {};
    expect(Object.keys(registered).sort()).toEqual(['anthropic', 'openrouter']);
  });

  it('should throw when an openrouter model is requested without OPENROUTER_API_KEY', () => {
    const factory = makeFactory();

    expect(() =>
      factory.languageModel('openrouter:deepseek/deepseek-v3.2')
    ).toThrow("No key for 'openrouter'");
  });

  it('should resolve an openrouter model through the registry when the key is configured', () => {
    const factory = makeFactory({ OPENROUTER_API_KEY: 'or-key' });

    const model = factory.languageModel('openrouter:deepseek/deepseek-v3.2');

    expect(model).toBe('mock-model');
    expect(languageModel).toHaveBeenCalledWith(
      'openrouter:deepseek/deepseek-v3.2'
    );
  });

  describe('system provider keys', () => {
    // mockReset restores the implementation each vi.mock factory supplied.
    afterEach(async () => {
      const { createProviderRegistry } = vi.mocked(await import('ai'));
      vi.mocked(createAnthropic).mockReset();
      createProviderRegistry.mockReset();
    });

    it('should route from env when no key source is wired', () => {
      const factory = makeFactory();

      expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(true);
    });

    it('should prefer a database key over the env key', async () => {
      vi.mocked(createAnthropic).mockClear();
      const factory = makeFactory(
        {},
        sourceOf([['anthropic', { enabled: true, apiKey: 'db-key' }]])
      );

      factory.isModelAvailable('anthropic:claude-sonnet-5');

      await vi.waitFor(() =>
        expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'db-key' })
      );
    });

    it('should treat a disabled provider as unavailable despite an env key', async () => {
      const factory = makeFactory(
        {},
        sourceOf([['anthropic', { enabled: false, apiKey: null }]])
      );

      factory.isModelAvailable('anthropic:claude-sonnet-5');

      await vi.waitFor(() =>
        expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(
          false
        )
      );
      expect(() => factory.languageModel('anthropic:claude-sonnet-5')).toThrow(
        "Provider 'anthropic' is disabled"
      );
    });

    it('should keep routing from env when the source fails', async () => {
      const systemKeys: SystemProviderKeysSource = {
        getSystemProviderConfigs: vi.fn(async () => {
          throw new Error('DB down');
        }),
      };
      const factory = makeFactory({}, systemKeys);

      await vi.waitFor(() =>
        expect(systemKeys.getSystemProviderConfigs).toHaveBeenCalled()
      );

      expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(true);
    });

    it('should keep routing the newer key when a slow refresh lands late', async () => {
      await routeKeyThroughMocks();
      const configs = [
        new Map([['anthropic', { enabled: true, apiKey: 'stale-key' }]]),
        new Map([['anthropic', { enabled: true, apiKey: 'fresh-key' }]]),
      ];
      let call = 0;
      const resolvers: (() => void)[] = [];
      const systemKeys: SystemProviderKeysSource = {
        getSystemProviderConfigs: vi.fn(async () => {
          const configsForCall = configs[call++];
          await new Promise<void>((resolve) => resolvers.push(resolve));
          return configsForCall as Map<AIProvider, SystemProviderConfig>;
        }),
      };
      const factory = new ProviderRegistryFactory(
        createMockConfig({ ANTHROPIC_API_KEY: '' }),
        systemKeys
      );

      const stale = factory.refreshSystemConfigs();
      const fresh = factory.refreshSystemConfigs();
      resolvers[1]();
      await fresh;
      resolvers[0]();
      await stale;

      expect(factory.languageModel('anthropic:claude-sonnet-5')).toBe(
        'model-from:fresh-key'
      );
    });

    it('should prime the stored config before serving the first request', async () => {
      // No env key at all: only the primed DB row can make this routable.
      const factory = new ProviderRegistryFactory(
        createMockConfig({ ANTHROPIC_API_KEY: '' }),
        sourceOf([['anthropic', { enabled: true, apiKey: 'db-key' }]])
      );

      await factory.onModuleInit();

      expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(true);
      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'db-key' });
    });
  });

  describe('gateway mode', () => {
    it('should create the gateway provider with the configured API key', () => {
      createGateway.mockClear();

      makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      expect(createGateway).toHaveBeenCalledWith({ apiKey: 'gw-key' });
    });

    it('should resolve model ids through the gateway in slash format', () => {
      const factory = makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      const model = factory.languageModel('anthropic:claude-sonnet-4-20250514');

      expect(model).toBe('mock-gateway-model');
      expect(gatewayLanguageModel).toHaveBeenCalledWith(
        'anthropic/claude-sonnet-4-20250514'
      );
    });

    it('should reject openrouter models — a different catalog than the gateway', () => {
      const factory = makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      expect(() =>
        factory.languageModel('openrouter:deepseek/deepseek-v3.2')
      ).toThrow('not routable in gateway mode');
      expect(
        factory.isModelAvailable('openrouter:deepseek/deepseek-v3.2')
      ).toBe(false);
      expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(true);
    });

    it('should not require direct provider API keys', () => {
      const factory = makeFactory({
        AI_GATEWAY_API_KEY: 'gw-key',
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
      });

      expect(factory.languageModel('anthropic:claude-sonnet-4-20250514')).toBe(
        'mock-gateway-model'
      );
      expect(factory.languageModel('openai:gpt-5')).toBe('mock-gateway-model');
    });

    it('should reject model ids without a provider prefix', () => {
      const factory = makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      expect(() => factory.languageModel('claude-sonnet-4-20250514')).toThrow(
        "must use the 'provider:model' format"
      );
    });

    it('should not build the direct-SDK registry', async () => {
      const { createProviderRegistry } = vi.mocked(await import('ai'));
      createProviderRegistry.mockClear();

      const factory = new ProviderRegistryFactory(
        createMockConfig({ AI_GATEWAY_API_KEY: 'gw-key' }),
        sourceOf([['anthropic', { enabled: true, apiKey: 'db-key' }]])
      );
      await factory.onModuleInit();

      expect(createProviderRegistry).not.toHaveBeenCalled();
    });

    it('should honor provider disablement — the gateway holds the keys, not the routing policy', async () => {
      const factory = new ProviderRegistryFactory(
        createMockConfig({ AI_GATEWAY_API_KEY: 'gw-key' }),
        sourceOf([['anthropic', { enabled: false, apiKey: null }]])
      );
      await factory.onModuleInit();

      expect(() => factory.languageModel('anthropic:claude-sonnet-5')).toThrow(
        "Provider 'anthropic' is disabled"
      );
      expect(factory.isModelAvailable('anthropic:claude-sonnet-5')).toBe(false);
    });

    it('should keep routing providers it does not track — the gateway catalog is wider', async () => {
      const factory = new ProviderRegistryFactory(
        createMockConfig({ AI_GATEWAY_API_KEY: 'gw-key' }),
        sourceOf([['anthropic', { enabled: false, apiKey: null }]])
      );
      await factory.onModuleInit();

      expect(factory.languageModel('mistral:mistral-large')).toBe(
        'mock-gateway-model'
      );
    });
  });

  describe('BYOK (per-request key override)', () => {
    it('should build a model from a user key for a provider the server lacks', () => {
      const factory = makeFactory({ GOOGLE_GENERATIVE_AI_API_KEY: '' });

      const model = factory.languageModel(
        'google:gemini-3.5-flash',
        'user-key'
      );

      expect(model).toBe('mock-google-byok-model');
      expect(createGoogle).toHaveBeenCalledWith({
        apiKey: 'user-key',
      });
    });

    it('should throw for an unknown provider under BYOK', () => {
      const factory = makeFactory();

      expect(() => factory.languageModel('mistral:x', 'user-key')).toThrow(
        "Provider 'mistral' does not support a caller-supplied key"
      );
    });

    it('should prefer the user BYOK key over gateway mode', () => {
      const factory = makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      const model = factory.languageModel(
        'anthropic:claude-sonnet-4-20250514',
        'user-key'
      );

      expect(model).toBe('mock-anthropic-byok-model');
      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'user-key' });
    });

    it('should build an openrouter model from a caller-supplied key', () => {
      const factory = makeFactory();

      const model = factory.languageModel(
        'openrouter:deepseek/deepseek-v3.2',
        'probe-key'
      );

      expect(model).toBe('mock-openrouter');
      expect(createOpenRouter).toHaveBeenCalledWith({ apiKey: 'probe-key' });
    });
  });
});
