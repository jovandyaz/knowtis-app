import { MODEL_INDEX_SNAPSHOT, ModelIndexCatalog } from '@jovandyaz/llm-router';
import { describe, expect, it } from 'vitest';

import { BYOK_PROVIDERS, MODEL_INTENTS } from '@knowtis/shared-types';

import { resolveByokSelectors } from '../../domain/model-catalog/byok-intent-routes';
import { unservedFloorModels } from '../../domain/model-catalog/floor-models';
import {
  resolveByokIntent,
  resolvePlatformIntent,
} from '../../domain/model-catalog/model-selectors';
import { PLATFORM_SEED_MODELS } from '../../domain/model-catalog/platform-resolution';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';

const SNAPSHOT_CATALOG = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);

describe('vendored model index snapshot', () => {
  it('supports, fully prices and sizes the input window of the resolution of every platform and BYOK intent route', () => {
    expect(unservedFloorModels(SNAPSHOT_CATALOG, SNAPSHOT_DATE)).toEqual([]);
  });

  it('resolves every intent on every BYOK provider and the platform', () => {
    for (const intent of MODEL_INTENTS) {
      expect(
        resolvePlatformIntent(intent, MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE),
        `platform ${intent}`
      ).not.toBeNull();
      for (const provider of BYOK_PROVIDERS) {
        expect(
          resolveByokIntent(
            intent,
            provider,
            MODEL_INDEX_SNAPSHOT,
            SNAPSHOT_DATE
          ),
          `${intent} on ${provider}`
        ).not.toBeNull();
      }
    }
  });

  it('never ranks one row under two intents', () => {
    const resolutions = resolveByokSelectors(
      MODEL_INDEX_SNAPSHOT,
      SNAPSHOT_DATE
    );
    const ids = MODEL_INTENTS.flatMap((intent) =>
      resolutions[intent].flatMap((candidate) =>
        Object.values(candidate.ranked).flatMap(
          (rows) => rows?.map((row) => row.id) ?? []
        )
      )
    );

    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
  });

  it('supports every platform seed model', () => {
    expect(
      Object.values(PLATFORM_SEED_MODELS).filter(
        (id) => !SNAPSHOT_CATALOG.isSupported(id)
      )
    ).toEqual([]);
  });
});
