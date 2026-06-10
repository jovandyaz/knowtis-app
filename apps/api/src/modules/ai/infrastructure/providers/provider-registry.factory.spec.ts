import { describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { ProviderRegistryFactory } from './provider-registry.factory';

const { languageModel } = vi.hoisted(() => ({
  languageModel: vi.fn().mockReturnValue('mock-model'),
}));

vi.mock('ai', () => ({
  createProviderRegistry: vi.fn(() => ({ languageModel })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn().mockReturnValue('mock-google'),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue('mock-openai'),
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
});
