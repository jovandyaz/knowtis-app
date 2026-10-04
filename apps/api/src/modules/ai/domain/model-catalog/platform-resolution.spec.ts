import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_INTENTS } from '@knowtis/shared-types';

import { seededResolution } from '../../testing/platform-resolutions';
import { MS_PER_DAY } from '../value-objects/utc-day';
import {
  activeModelIdsOf,
  derivedChain,
  intentOfSelectorKey,
  PLATFORM_SEED_MODELS,
  platformBilledModelIds,
  RESOLUTION_GRACE_DAYS,
  resolutionChange,
  SEED_RESOLUTIONS,
  SELECTOR_KEY_BY_INTENT,
} from './platform-resolution';

const SEED_SQL = readFileSync(
  join(__dirname, '../../../../../drizzle/0060_seed_model_resolutions.sql'),
  'utf8'
);

describe('platform resolution seed', () => {
  it.each(MODEL_INTENTS)(
    'seeds the %s intent with its code seed model',
    (intent) => {
      expect(SEED_SQL).toContain(
        `('${SELECTOR_KEY_BY_INTENT[intent]}', '${PLATFORM_SEED_MODELS[intent]}')`
      );
    }
  );

  it.each(MODEL_INTENTS)(
    'builds the %s seed row with no history or pending entry',
    (intent) => {
      expect(
        SEED_RESOLUTIONS.find(
          (row) => row.selectorKey === SELECTOR_KEY_BY_INTENT[intent]
        )
      ).toEqual({
        selectorKey: SELECTOR_KEY_BY_INTENT[intent],
        activeModelId: PLATFORM_SEED_MODELS[intent],
        previousModelId: null,
        changedAt: null,
        releasedModelId: null,
        releasedAt: null,
        pendingModelId: null,
        gateStatus: null,
      });
    }
  );
});

const NOW = new Date('2026-10-04T00:00:00.000Z');
const GRACE_MS = RESOLUTION_GRACE_DAYS * MS_PER_DAY;
const LEFT = 'openrouter:z-ai/glm-5.2';
const RELEASED = 'openrouter:qwen/qwen3.8-max-0902';
const CANDIDATE = 'openrouter:deepseek/deepseek-v4.1-flash';

it.each(MODEL_INTENTS)('maps %s to its selector key and back', (intent) => {
  expect(intentOfSelectorKey(SELECTOR_KEY_BY_INTENT[intent])).toBe(intent);
});

it('bills every active model to the platform', () => {
  expect(platformBilledModelIds(SEED_RESOLUTIONS, NOW)).toEqual(
    new Set(Object.values(PLATFORM_SEED_MODELS))
  );
});

it.each([
  [
    'previous',
    { previousModelId: LEFT, changedAt: new Date(NOW.getTime() - GRACE_MS) },
    LEFT,
  ],
  [
    'released',
    {
      releasedModelId: RELEASED,
      releasedAt: new Date(NOW.getTime() - GRACE_MS),
    },
    RELEASED,
  ],
] as const)(
  'keeps a %s model billed through the last grace day',
  (_, overrides, id) => {
    const rows = [seededResolution('fast', overrides)];
    expect(platformBilledModelIds(rows, NOW).has(id)).toBe(true);
  }
);

it.each([
  [
    'previous',
    {
      previousModelId: LEFT,
      changedAt: new Date(NOW.getTime() - GRACE_MS - 1),
    },
    LEFT,
  ],
  [
    'released',
    {
      releasedModelId: RELEASED,
      releasedAt: new Date(NOW.getTime() - GRACE_MS - 1),
    },
    RELEASED,
  ],
] as const)(
  'stops billing a %s model once the grace ends',
  (_, overrides, id) => {
    const rows = [seededResolution('fast', overrides)];
    expect(platformBilledModelIds(rows, NOW).has(id)).toBe(false);
  }
);

it('derives the chain balanced, fast, powerful, once each, without empties', () => {
  expect(derivedChain({ fast: 'a', balanced: 'b', powerful: 'c' })).toEqual([
    'b',
    'a',
    'c',
  ]);
  expect(derivedChain({ fast: 'a', balanced: 'a', powerful: '' })).toEqual([
    'a',
  ]);
});

const PEND = {
  kind: 'pend',
  selectorKey: 'platform.fast',
  modelId: CANDIDATE,
} as const;
const CLEAR = { kind: 'clear', selectorKey: 'platform.fast' } as const;

it.each([
  ['no candidate', {}, null, null],
  [
    'no candidate, with a pending entry',
    { pendingModelId: CANDIDATE, gateStatus: 'pending' },
    null,
    null,
  ],
  ['the active model, nothing pending', {}, PLATFORM_SEED_MODELS.fast, null],
  [
    'the active model, another one pending',
    { pendingModelId: CANDIDATE, gateStatus: 'pending' },
    PLATFORM_SEED_MODELS.fast,
    CLEAR,
  ],
  [
    'the active model, another one failed',
    { pendingModelId: CANDIDATE, gateStatus: 'failed' },
    PLATFORM_SEED_MODELS.fast,
    null,
  ],
  [
    'the pending model',
    { pendingModelId: CANDIDATE, gateStatus: 'pending' },
    CANDIDATE,
    null,
  ],
  [
    'a model that already failed',
    { pendingModelId: CANDIDATE, gateStatus: 'failed' },
    CANDIDATE,
    null,
  ],
  ['a new model', {}, CANDIDATE, PEND],
  [
    'a model other than the failed one',
    { pendingModelId: LEFT, gateStatus: 'failed' },
    CANDIDATE,
    PEND,
  ],
] as const)(
  'pends, clears or changes nothing, given %s',
  (_, overrides, candidate, expected) => {
    expect(
      resolutionChange(seededResolution('fast', overrides), candidate)
    ).toEqual(expected);
  }
);

describe('activeModelIdsOf', () => {
  it('lists active models in MODEL_INTENTS order whatever the row order', () => {
    const rows = [...SEED_RESOLUTIONS].reverse();
    expect(activeModelIdsOf(rows)).toEqual(
      MODEL_INTENTS.map((intent) => PLATFORM_SEED_MODELS[intent])
    );
  });

  it('skips an intent that has no row', () => {
    expect(activeModelIdsOf([seededResolution('powerful')])).toEqual([
      PLATFORM_SEED_MODELS.powerful,
    ]);
  });
});
