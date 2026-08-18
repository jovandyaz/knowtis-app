import { describe, expect, it } from 'vitest';

import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { servingRolesFrom } from '../serving-roles';

function entry(key: string, value: string, kind: string): AiConfigEntry {
  return {
    key,
    value,
    kind,
    source: 'custom',
    storedValue: null,
    description: null,
    updatedAt: null,
  };
}

const FLASH = 'openrouter:deepseek/deepseek-v4-flash-0731';
const MINIMAX = 'openrouter:minimax/minimax-m3';
const PRO = 'openrouter:deepseek/deepseek-v4-pro-0813';

describe('servingRolesFrom', () => {
  it('maps each intent key to the model it serves', () => {
    const roles = servingRolesFrom([
      entry('ai_default_model', FLASH, 'model'),
      entry('ai_fast_model', MINIMAX, 'model'),
      entry('ai_deep_model', PRO, 'model'),
    ]);

    expect(roles.get(FLASH)).toEqual(['Default']);
    expect(roles.get(MINIMAX)).toEqual(['Fast']);
    expect(roles.get(PRO)).toEqual(['Deep']);
  });

  it('marks every member of the fallback chain', () => {
    const roles = servingRolesFrom([
      entry('ai_fallback_chain', `${FLASH},${MINIMAX}`, 'chain'),
    ]);

    expect(roles.get(FLASH)).toEqual(['Fallback']);
    expect(roles.get(MINIMAX)).toEqual(['Fallback']);
  });

  it('accumulates roles for a model serving several keys, intents first', () => {
    const roles = servingRolesFrom([
      entry('ai_fallback_chain', `${FLASH},${MINIMAX}`, 'chain'),
      entry('ai_default_model', FLASH, 'model'),
    ]);

    expect(roles.get(FLASH)).toEqual(['Default', 'Fallback']);
  });

  it('reports no roles when config has not loaded', () => {
    expect(servingRolesFrom(undefined).size).toBe(0);
    expect(servingRolesFrom([]).size).toBe(0);
  });

  it('ignores a key that only matches an inherited object property', () => {
    const roles = servingRolesFrom([entry('toString', FLASH, 'model')]);

    expect(roles.size).toBe(0);
  });

  it('ignores keys that do not name models', () => {
    const roles = servingRolesFrom([
      entry('ai_reasoning_effort', 'medium', 'choice'),
      entry('ai_free_tier_ceiling', '4.00', 'money'),
    ]);

    expect(roles.size).toBe(0);
  });
});
