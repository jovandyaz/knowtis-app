import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import {
  advancedModelOptions,
  effortOptions,
  moreModelGroups,
  primaryRows,
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

describe('models listed without access', () => {
  const { access: _omitted, ...listed } = {
    ...model,
    id: 'anthropic:claude-opus-5',
  };

  it('offers a key-billed model the server lists without access in Advanced', () => {
    expect(advancedModelOptions([listed])).toEqual([listed]);
  });

  it('keeps an unbilled model the server lists without access in more models', () => {
    expect(
      moreModelGroups([{ ...listed, billedToUser: false }], t).flatMap(
        (group) => group.options
      )
    ).toEqual([expect.objectContaining({ id: 'anthropic:claude-opus-5' })]);
  });

  it('does not lock an intent row for a model the server lists without access', () => {
    expect(
      primaryRows([{ ...listed, servesIntent: 'balanced' }], t).map(
        (row) => row.locked
      )
    ).toEqual([false]);
  });
});
