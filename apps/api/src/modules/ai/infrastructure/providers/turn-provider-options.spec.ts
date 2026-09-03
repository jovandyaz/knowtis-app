import { describe, expect, it } from 'vitest';

import { turnProviderOptions } from './turn-provider-options';

const OPENROUTER_MODEL = 'openrouter:minimax/minimax-m3';

describe('turnProviderOptions', () => {
  it('should stay silent when the operator asks for nothing', () => {
    expect(
      turnProviderOptions({ model: OPENROUTER_MODEL, providerOrder: [] })
    ).toEqual({});
  });

  it('should let the vetted upstreams be preferred without cutting off the rest', () => {
    expect(
      turnProviderOptions({
        model: OPENROUTER_MODEL,
        providerOrder: ['fireworks', 'baseten'],
      })
    ).toEqual({
      providerOptions: {
        openrouter: {
          provider: {
            order: ['fireworks', 'baseten'],
            allow_fallbacks: true,
          },
        },
      },
    });
  });

  it('should ask for parameter support even when no upstream order is set', () => {
    expect(
      turnProviderOptions({
        model: OPENROUTER_MODEL,
        requireParameters: true,
      })
    ).toEqual({
      providerOptions: {
        openrouter: { provider: { require_parameters: true } },
      },
    });
  });

  it('should carry the reasoning effort alongside the routing block', () => {
    expect(
      turnProviderOptions({
        model: OPENROUTER_MODEL,
        reasoningEffort: 'low',
        providerOrder: ['fireworks'],
        requireParameters: true,
      })
    ).toEqual({
      providerOptions: {
        openrouter: {
          reasoning: { effort: 'low' },
          provider: {
            order: ['fireworks'],
            allow_fallbacks: true,
            require_parameters: true,
          },
        },
      },
    });
  });

  it('forwards effort to anthropic as adaptive thinking plus effort', () => {
    expect(
      turnProviderOptions({
        model: 'anthropic:claude-opus-5',
        reasoningEffort: 'max',
        providerOrder: ['fireworks'],
      })
    ).toEqual({
      providerOptions: {
        anthropic: {
          thinking: { type: 'adaptive', display: 'summarized' },
          effort: 'max',
        },
      },
    });
  });

  it('forwards effort to openai as a reasoningEffort', () => {
    expect(
      turnProviderOptions({
        model: 'openai:gpt-5.6-sol',
        reasoningEffort: 'xhigh',
      })
    ).toEqual({
      providerOptions: {
        openai: { reasoningEffort: 'xhigh' },
      },
    });
  });

  it('forwards effort to google as a thinking level with thoughts included', () => {
    expect(
      turnProviderOptions({
        model: 'google:gemini-3.1-pro-preview',
        reasoningEffort: 'medium',
      })
    ).toEqual({
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
        },
      },
    });
  });

  it('forwards the lowest declared google level as a thinking level', () => {
    expect(
      turnProviderOptions({
        model: 'google:gemini-3.1-pro-preview',
        reasoningEffort: 'low',
      })
    ).toEqual({
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'low', includeThoughts: true },
        },
      },
    });
  });

  it('forwards the highest declared google level as a thinking level', () => {
    expect(
      turnProviderOptions({
        model: 'google:gemini-3.1-pro-preview',
        reasoningEffort: 'high',
      })
    ).toEqual({
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
        },
      },
    });
  });

  it('sends nothing to google for a level its thinking config does not accept', () => {
    expect(
      turnProviderOptions({
        model: 'google:gemini-3.1-pro-preview',
        reasoningEffort: 'max',
      })
    ).toEqual({});
  });

  it('sends nothing to a direct provider without an effort', () => {
    expect(
      turnProviderOptions({
        model: 'anthropic:claude-opus-5',
        providerOrder: ['fireworks'],
        requireParameters: true,
      })
    ).toEqual({});
  });

  it('sends nothing for an unknown provider', () => {
    expect(
      turnProviderOptions({ model: 'mistral:large', reasoningEffort: 'high' })
    ).toEqual({});
  });
});
