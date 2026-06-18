import { describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { ProviderRegistryFactory } from './provider-registry.factory';

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
  createGoogleGenerativeAI: vi.fn(() =>
    vi.fn().mockReturnValue('mock-google-byok-model')
  ),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn().mockReturnValue('mock-openai-byok-model')),
}));

function makeFactory(overrides?: Record<string, unknown>) {
  const factory = new ProviderRegistryFactory(createMockConfig(overrides));
  factory.onModuleInit();
  return factory;
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
    ).toThrow('ANTHROPIC_API_KEY is not configured');
  });

  it('should throw when a google model is requested without GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('google:gemini-2.5-flash')).toThrow(
      'GOOGLE_GENERATIVE_AI_API_KEY is not configured'
    );
  });

  it('should throw when an openai model is requested without OPENAI_API_KEY', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('openai:gpt-5')).toThrow(
      'OPENAI_API_KEY is not configured'
    );
  });

  it('should reject model ids without a provider prefix', () => {
    const factory = makeFactory();

    expect(() => factory.languageModel('claude-sonnet-4-20250514')).toThrow(
      "must use the 'provider:model' format"
    );
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

      makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      expect(createProviderRegistry).not.toHaveBeenCalled();
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
    });

    it('should throw for an unknown provider under BYOK', () => {
      const factory = makeFactory();

      expect(() => factory.languageModel('mistral:x', 'user-key')).toThrow();
    });

    it('should ignore byokKey in gateway mode and return gateway model', () => {
      const factory = makeFactory({ AI_GATEWAY_API_KEY: 'gw-key' });

      const model = factory.languageModel(
        'anthropic:claude-sonnet-4-20250514',
        'user-key'
      );

      expect(model).toBe('mock-gateway-model');
    });
  });
});
