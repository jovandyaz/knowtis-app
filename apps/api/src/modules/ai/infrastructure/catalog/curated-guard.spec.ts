import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, ModelIndexCatalog } from '@knowtis/ai-gateway';
import { parseChain } from '@knowtis/shared-types';

import { AI_SETTING_DEFAULTS } from '../../domain/ai-settings';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';

const SNAPSHOT_CATALOG = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);

const PLATFORM_MODEL_IDS: readonly string[] = [
  ...new Set([
    ...CURATED_MODELS.map((model) => model.id),
    AI_SETTING_DEFAULTS.ai_default_model,
    AI_SETTING_DEFAULTS.ai_fast_model,
    AI_SETTING_DEFAULTS.ai_deep_model,
    ...parseChain(AI_SETTING_DEFAULTS.ai_fallback_chain),
  ]),
];

describe('vendored model index snapshot', () => {
  it.each(PLATFORM_MODEL_IDS)(
    'supports, fully prices and sizes the input window of %s',
    (modelId) => {
      const pricing = SNAPSHOT_CATALOG.getPricing(modelId);
      const window = SNAPSHOT_CATALOG.getContextWindow(modelId);

      expect(SNAPSHOT_CATALOG.isSupported(modelId)).toBe(true);
      expect(pricing?.inputCostPerToken ?? 0).toBeGreaterThan(0);
      expect(pricing?.outputCostPerToken ?? 0).toBeGreaterThan(0);
      expect(window?.maxInputTokens ?? 0).toBeGreaterThan(0);
    }
  );
});
