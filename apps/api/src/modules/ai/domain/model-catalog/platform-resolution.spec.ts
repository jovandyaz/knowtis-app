import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_INTENTS } from '@knowtis/shared-types';

import {
  PLATFORM_SEED_MODELS,
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
