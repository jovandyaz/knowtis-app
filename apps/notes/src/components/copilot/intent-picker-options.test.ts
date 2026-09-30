import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import {
  advancedModelOptions,
  effortOptions,
  moreModelGroups,
} from './intent-picker-options';

const t = ((key: string) => key) as unknown as TFunction<'common'>;

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

  it('offers a key-billed model in Advanced', () => {
    expect(advancedModelOptions([listed])).toEqual([listed]);
  });

  it('keeps a key-billed model in more models', () => {
    expect(
      moreModelGroups([listed], t).flatMap((group) => group.options)
    ).toEqual([expect.objectContaining({ id: 'anthropic:claude-opus-5' })]);
  });

  it('keeps an intent-serving model out of more models and Advanced', () => {
    const serving = {
      ...model,
      billedToUser: false,
      servesIntent: 'fast' as const,
    };

    expect(advancedModelOptions([serving])).toEqual([]);
    expect(moreModelGroups([serving], t)).toEqual([]);
  });
});
