import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { ModelIntent, SelectableModel } from '@knowtis/shared-types';

import {
  advancedGroups,
  advancedModelOptions,
  advancedOptionDescription,
  effortOptions,
  primaryRows,
  resolveSelectedModel,
  resolveServingModel,
} from './intent-picker-options';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts
    ? `${key}(${Object.entries(opts)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`
    : key) as unknown as TFunction<'common'>;

const model = {
  id: 'openrouter:deepseek/deepseek-v4-flash',
  label: 'DeepSeek V4 Flash',
  descriptionKey: '',
  tier: 'open',
  contextWindow: 128000,
  costClass: 1,
  isDefault: true,
  billedToUser: true,
  routableByServer: true,
} satisfies SelectableModel;

describe('effortOptions', () => {
  it('orders the ladder by REASONING_EFFORTS whatever order upstream declared', () => {
    const options = effortOptions(
      {
        ...model,
        reasoning: { levels: ['max', 'high', 'low'], mandatory: false },
      },
      t
    );

    expect(options.map((o) => o.id)).toEqual(['auto', 'low', 'high', 'max']);
  });

  it('offers nothing for a model that declares no levels', () => {
    expect(effortOptions(model, t)).toEqual([]);
    expect(
      effortOptions({ ...model, reasoning: { levels: [], mandatory: true } }, t)
    ).toEqual([]);
  });
});

describe('models outside an intent', () => {
  const listed = { ...model, id: 'anthropic:claude-opus-5' };

  it('offers a key-billed model in the settings Advanced list', () => {
    expect(advancedModelOptions([listed])).toEqual([listed]);
  });

  it('lists a key-billed model under its provider in Avanzado', () => {
    expect(advancedGroups([listed], t)).toEqual([
      {
        label: 'Anthropic',
        options: [
          expect.objectContaining({
            id: 'anthropic:claude-opus-5',
            billedBadge: 'aiAssistant.byok.billedBadge',
          }),
        ],
      },
    ]);
  });

  it('groups by provider in BYOK_PROVIDERS order, so one model on two keys reads as two routes', () => {
    const haiku = { ...model, label: 'Haiku 4.5' };
    const groups = advancedGroups(
      [
        { ...haiku, id: 'openrouter:anthropic/claude-haiku-4.5' },
        { ...model, id: 'openai:gpt-6', label: 'GPT-6' },
        { ...haiku, id: 'anthropic:claude-haiku-4-5' },
      ],
      t
    );

    expect(
      groups.map((group) => [
        group.label,
        group.options.map((option) => option.label),
      ])
    ).toEqual([
      ['Anthropic', ['Haiku 4.5']],
      ['OpenAI', ['GPT-6']],
      ['OpenRouter', ['Haiku 4.5']],
    ]);
  });

  it('keeps an intent-serving model out of Avanzado', () => {
    expect(
      advancedGroups([{ ...model, servesIntent: 'fast' as const }], t)
    ).toEqual([]);
  });

  it('keeps a server-billed model out of Avanzado and of the settings Advanced list', () => {
    const serverBilled = { ...model, billedToUser: false };

    expect(advancedModelOptions([serverBilled])).toEqual([]);
    expect(advancedGroups([serverBilled], t)).toEqual([]);
  });
});

describe('primaryRows', () => {
  it('names each row after its intent and details the model serving it today', () => {
    const rows = primaryRows(
      [
        { ...model, id: 'a:deep', label: 'Opus 5', servesIntent: 'powerful' },
        { ...model, id: 'a:fast', label: 'Haiku 4.5', servesIntent: 'fast' },
      ],
      t
    );

    expect(rows).toEqual([
      {
        id: 'fast',
        label: 'aiAssistant.intent.fast',
        description:
          'aiAssistant.intent.rowDetail(model=Haiku 4.5,hint=aiAssistant.intent.fastHint)',
      },
      {
        id: 'powerful',
        label: 'aiAssistant.intent.powerful',
        description:
          'aiAssistant.intent.rowDetail(model=Opus 5,hint=aiAssistant.intent.powerfulHint)',
      },
    ]);
  });
});

describe('resolveSelectedModel', () => {
  const fast = {
    ...model,
    id: 'anthropic:claude-haiku-4-5',
    servesIntent: 'fast' as const,
  };
  const balanced = {
    ...model,
    id: 'anthropic:claude-sonnet-5',
    servesIntent: 'balanced' as const,
  };

  it('resolves an advanced pick that also serves an intent over the stored intent', () => {
    expect(
      resolveSelectedModel([fast, balanced], {
        preferredModel: 'anthropic:claude-sonnet-5',
        preferredIntent: 'fast',
      })
    ).toBe(balanced);
  });

  it('falls back to the stored intent when the picked model is no longer listed', () => {
    expect(
      resolveSelectedModel([fast, balanced], {
        preferredModel: 'anthropic:claude-opus-5',
        preferredIntent: 'fast',
      })
    ).toBe(fast);
  });
});

describe('advancedOptionDescription', () => {
  it('leads with the provider whose key serves the model', () => {
    expect(
      advancedOptionDescription(
        {
          id: 'openrouter:anthropic/claude-haiku-4.5',
          descriptionKey: 'aiModels.class.fast',
        },
        t
      )
    ).toBe(
      'aiAssistant.advanced.routeDetail(provider=OpenRouter,detail=aiModels.class.fast)'
    );
  });

  it('names only the provider of a model with no copy', () => {
    expect(
      advancedOptionDescription(
        { id: 'anthropic:claude-haiku-4-5', descriptionKey: '' },
        t
      )
    ).toBe('Anthropic');
  });

  it('keeps the copy alone for a model no BYOK key serves', () => {
    expect(
      advancedOptionDescription(
        { id: 'z-ai:glm-5.3', descriptionKey: '', description: 'Open model' },
        t
      )
    ).toBe('Open model');
  });
});

describe('resolveServingModel', () => {
  const servingIntent = (id: string, servesIntent: ModelIntent) => ({
    ...model,
    id,
    servesIntent,
  });
  const fast = servingIntent('openrouter:anthropic/claude-haiku-4.5', 'fast');
  const balanced = servingIntent('google:gemini-3.8-flash', 'balanced');

  it('serves the selected model while the list offers it', () => {
    expect(
      resolveServingModel([fast, balanced], {
        preferredModel: null,
        preferredIntent: 'fast',
      })
    ).toBe(fast);
  });

  it('substitutes the next intent in the server’s fallback order when the preferred one has no model', () => {
    expect(
      resolveServingModel([fast, balanced], {
        preferredModel: null,
        preferredIntent: 'powerful',
      })
    ).toBe(balanced);
  });

  it('resolves nothing when no listed model serves an intent', () => {
    expect(
      resolveServingModel([model], {
        preferredModel: null,
        preferredIntent: 'balanced',
      })
    ).toBeUndefined();
  });
});
