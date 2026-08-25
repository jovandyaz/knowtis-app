import { describe, expect, it } from 'vitest';

import { openrouterProviderOptions } from './openrouter-options';

const OPENROUTER_MODEL = 'openrouter:minimax/minimax-m3';

describe('openrouterProviderOptions', () => {
  it('should stay silent for a provider that does not understand the routing block', () => {
    expect(
      openrouterProviderOptions({
        model: 'anthropic:claude-sonnet-4-20250514',
        providerOrder: ['fireworks'],
        requireParameters: true,
      })
    ).toEqual({});
  });

  it('should stay silent when the operator asks for nothing', () => {
    expect(
      openrouterProviderOptions({ model: OPENROUTER_MODEL, providerOrder: [] })
    ).toEqual({});
  });

  it('should let the vetted upstreams be preferred without cutting off the rest', () => {
    expect(
      openrouterProviderOptions({
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
      openrouterProviderOptions({
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
      openrouterProviderOptions({
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
});
