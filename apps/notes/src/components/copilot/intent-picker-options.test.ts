import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import { effortOptions } from './intent-picker-options';

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
  access: 'granted',
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
