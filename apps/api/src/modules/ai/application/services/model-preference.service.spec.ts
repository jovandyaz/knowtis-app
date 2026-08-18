import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  FEATURE_FLAG_KEYS,
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  type ModelIntent,
} from '@knowtis/shared-types';

import { ModelPreferenceService } from './model-preference.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';
const OPEN_FALLBACK = 'openrouter:deepseek-mock';
const INTENT_MODELS: Record<ModelIntent, string> = {
  fast: 'openrouter:fast-mock',
  balanced: SYSTEM_DEFAULT,
  powerful: 'openrouter:deep-mock',
};
/** Stand-ins for the catalog's open tier: free to everyone even under gating. */
const OPEN_IDS: readonly string[] = [
  OPEN_FALLBACK,
  INTENT_MODELS.fast,
  INTENT_MODELS.powerful,
];

function make(
  pref: string | null,
  selectable: string[],
  byokProviders: string[] = [],
  tierGating = false,
  openFallback: string | null = OPEN_FALLBACK,
  preferredIntent: ModelIntent | null = null,
  intentModels: Record<ModelIntent, string> = INTENT_MODELS,
  firstOfTier: (tier: ModelIntent) => string | null = () => null
) {
  const repo = {
    getSettings: vi.fn().mockResolvedValue({
      preferredModel: pref,
      preferredIntent,
    }),
    patchSettings: vi.fn().mockResolvedValue(undefined),
  };
  const selectableSvc = {
    isSelectable: (
      id: string,
      _configured: ReadonlySet<string>,
      providers?: ReadonlySet<string>,
      tierGatingOn?: boolean
    ) => {
      const hasKey = Boolean(providers?.has(id.split(':')[0]));
      if (tierGatingOn) {
        return OPEN_IDS.includes(id) || hasKey;
      }
      return selectable.includes(id) || hasKey;
    },
    firstSelectable: () => openFallback,
    firstOfTier: (tier: ModelIntent) => firstOfTier(tier),
    list: (
      _systemDefault: string,
      _configured: ReadonlySet<string>,
      providers?: ReadonlySet<string>
    ) => {
      const unlocked = providers
        ? byokProviders
            .filter((p) => providers.has(p))
            .map((p) => `${p}:byok-model`)
        : [];
      return [...selectable, ...unlocked].map((id) => ({ id }));
    },
  };
  const aiConfig = {
    getDefaultModel: vi.fn().mockResolvedValue(SYSTEM_DEFAULT),
    getFreeTierMaxOutputCostPerToken: vi
      .fn()
      .mockResolvedValue(FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN),
    getIntentModel: vi
      .fn()
      .mockImplementation((intent: ModelIntent) =>
        Promise.resolve(intentModels[intent])
      ),
    getConfiguredModelIds: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Set([SYSTEM_DEFAULT, ...Object.values(intentModels)])
        )
      ),
  };
  const byok = {
    enabledProviders: vi.fn().mockResolvedValue(new Set(byokProviders)),
  };
  const flags = {
    isEnabled: vi
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(
          key === FEATURE_FLAG_KEYS.AI_TIER_GATING ? tierGating : false
        )
      ),
  };
  const svc = new ModelPreferenceService(
    repo as never,
    selectableSvc as never,
    aiConfig as never,
    byok as never,
    flags as never
  );
  return { svc, repo, aiConfig, byok, flags };
}

describe('ModelPreferenceService', () => {
  it('effective default = system default when no preference', async () => {
    const { svc } = make(null, [SYSTEM_DEFAULT]);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('effective default falls back to system when stored model is no longer selectable', async () => {
    const { svc } = make('openai:retired-model', [SYSTEM_DEFAULT]);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('setUserPreferences rejects an unselectable model', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await expect(
      svc.setUserPreferences('u1', { preferredModel: 'openai:nope' })
    ).rejects.toThrow(BadRequestException);
    expect(repo.patchSettings).not.toHaveBeenCalled();
  });

  it('setUserPreferences clears the model without validation', async () => {
    const { svc, repo } = make('x', [SYSTEM_DEFAULT]);
    await svc.setUserPreferences('u1', { preferredModel: null });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredModel: null,
    });
  });

  it('setUserPreferences skips the write when the patch carries no values', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await svc.setUserPreferences('u1', {});
    const dtoShaped: Parameters<typeof svc.setUserPreferences>[1] = {};
    Object.assign(dtoShaped, {
      preferredModel: undefined,
      preferredIntent: undefined,
    });
    await svc.setUserPreferences('u1', dtoShaped);
    expect(repo.patchSettings).not.toHaveBeenCalled();
  });

  it('listModels includes a BYOK-unlocked provider model', async () => {
    const { svc, byok } = make(null, [SYSTEM_DEFAULT], ['google']);
    const ids = (await svc.listModels('u1')).map((m) => m.id);
    expect(ids.some((id) => id.startsWith('google:'))).toBe(true);
    expect(byok.enabledProviders).toHaveBeenCalledWith('u1');
  });

  it('effective default accepts a stored model unlocked by a BYOK key', async () => {
    const { svc } = make(
      'google:gemini-3.5-flash',
      [SYSTEM_DEFAULT],
      ['google']
    );
    expect(await svc.getEffectiveDefault('u1')).toBe('google:gemini-3.5-flash');
  });

  it('setUserPreferences accepts a model unlocked by a BYOK key', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT], ['google']);
    await svc.setUserPreferences('u1', {
      preferredModel: 'google:gemini-3.5-flash',
    });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredModel: 'google:gemini-3.5-flash',
    });
  });

  it('setUserPreferences passes an intent-only patch through unvalidated', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await svc.setUserPreferences('u1', { preferredIntent: 'fast' });
    expect(repo.patchSettings).toHaveBeenCalledWith('u1', {
      preferredIntent: 'fast',
    });
  });

  it('getUserPreferences returns the stored model and intent', async () => {
    const { svc } = make(
      'openai:gpt-4o-mini',
      [SYSTEM_DEFAULT],
      [],
      false,
      OPEN_FALLBACK,
      'powerful'
    );
    expect(await svc.getUserPreferences('u1')).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'powerful',
    });
  });

  it('reports tier gating as enabled when the flag is on', async () => {
    const { svc } = make(null, [SYSTEM_DEFAULT], [], true);
    expect(await svc.tierGatingOn()).toBe(true);
  });

  it('tierGatingOn fails open to false when the flag store errors', async () => {
    const { svc, flags } = make(null, [SYSTEM_DEFAULT]);
    flags.isEnabled.mockRejectedValue(new Error('flag store down'));
    expect(await svc.tierGatingOn()).toBe(false);
  });

  it('effective default swaps both a gated stored model and a gated system default for an accessible model', async () => {
    const { svc } = make(
      'anthropic:claude-opus-4-8',
      ['anthropic:claude-opus-4-8'],
      [],
      true
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(OPEN_FALLBACK);
  });

  it('effective default keeps a gated system default when no accessible model exists', async () => {
    const { svc } = make(null, [SYSTEM_DEFAULT], [], true, null);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('effective default never validates the system default while the flag is off', async () => {
    const { svc } = make(null, [], [], false);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('effective default keeps the stored model when the caller holds its provider key under gating', async () => {
    const { svc } = make(
      'anthropic:claude-opus-4-8',
      ['anthropic:claude-opus-4-8'],
      ['anthropic'],
      true
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(
      'anthropic:claude-opus-4-8'
    );
  });

  it('isSelectableWith threads tier gating into the selectability check', async () => {
    const { svc } = make(null, ['anthropic:claude-opus-4-8']);
    await expect(
      svc.isSelectableWith('anthropic:claude-opus-4-8', new Set(), false)
    ).resolves.toBe(true);
    await expect(
      svc.isSelectableWith('anthropic:claude-opus-4-8', new Set(), true)
    ).resolves.toBe(false);
    await expect(
      svc.isSelectableWith(
        'anthropic:claude-opus-4-8',
        new Set(['anthropic']),
        true
      )
    ).resolves.toBe(true);
  });

  it('effective default resolves the intent through its ai_config key for a keyless caller', async () => {
    const { svc, aiConfig } = make(
      null,
      [SYSTEM_DEFAULT, 'openrouter:deep-mock'],
      [],
      false,
      OPEN_FALLBACK,
      'powerful'
    );
    expect(await svc.getEffectiveDefault('u1')).toBe('openrouter:deep-mock');
    expect(aiConfig.getIntentModel).toHaveBeenCalledWith('powerful');
  });

  it('effective default treats a null intent as the balanced default', async () => {
    const { svc, aiConfig } = make(
      null,
      [SYSTEM_DEFAULT],
      [],
      false,
      OPEN_FALLBACK,
      null
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
    expect(aiConfig.getIntentModel).toHaveBeenCalledWith('balanced');
  });

  it('effective default prefers a BYOK model of the intent tier over its ai_config key', async () => {
    const { svc } = make(
      null,
      ['anthropic:claude-opus-4-8', 'openrouter:deep-mock'],
      ['anthropic'],
      false,
      OPEN_FALLBACK,
      'powerful',
      INTENT_MODELS,
      () => 'anthropic:claude-opus-4-8'
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(
      'anthropic:claude-opus-4-8'
    );
  });

  it('effective default keeps an explicit BYOK stored model above the intent', async () => {
    const { svc, aiConfig } = make(
      'openai:gpt-5.6',
      ['openai:gpt-5.6', SYSTEM_DEFAULT],
      ['openai'],
      false,
      OPEN_FALLBACK,
      'fast'
    );
    expect(await svc.getEffectiveDefault('u1')).toBe('openai:gpt-5.6');
    expect(aiConfig.getIntentModel).not.toHaveBeenCalled();
  });

  it('effective default ignores a legacy non-BYOK stored model', async () => {
    const { svc, aiConfig } = make(
      OPEN_FALLBACK,
      [OPEN_FALLBACK, SYSTEM_DEFAULT],
      [],
      false,
      OPEN_FALLBACK,
      null
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
    expect(aiConfig.getIntentModel).toHaveBeenCalledWith('balanced');
  });

  it('effective default falls through to the legacy cascade when the intent target is unselectable', async () => {
    const { svc } = make(
      null,
      [SYSTEM_DEFAULT],
      [],
      false,
      OPEN_FALLBACK,
      'powerful',
      {
        fast: 'openrouter:not-selectable',
        balanced: 'openrouter:not-selectable',
        powerful: 'openrouter:not-selectable',
      }
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('effective default lands a gated keyless caller on the open model of the intent', async () => {
    const { svc, aiConfig } = make(
      null,
      [SYSTEM_DEFAULT],
      [],
      true,
      OPEN_FALLBACK,
      'powerful'
    );
    expect(await svc.getEffectiveDefault('u1')).toBe('openrouter:deep-mock');
    expect(aiConfig.getIntentModel).toHaveBeenCalledWith('powerful');
  });

  it('effective default keeps the BYOK model of the intent tier under gating', async () => {
    const { svc, aiConfig } = make(
      null,
      ['anthropic:claude-opus-4-8'],
      ['anthropic'],
      true,
      OPEN_FALLBACK,
      'powerful',
      INTENT_MODELS,
      () => 'anthropic:claude-opus-4-8'
    );
    expect(await svc.getEffectiveDefault('u1')).toBe(
      'anthropic:claude-opus-4-8'
    );
    expect(aiConfig.getIntentModel).not.toHaveBeenCalled();
  });

  it('effective default still resolves the intent when the flag store errors', async () => {
    const { svc, flags } = make(
      null,
      [SYSTEM_DEFAULT, 'openrouter:deep-mock'],
      [],
      false,
      OPEN_FALLBACK,
      'powerful'
    );
    flags.isEnabled.mockRejectedValue(new Error('flag store down'));
    expect(await svc.getEffectiveDefault('u1')).toBe('openrouter:deep-mock');
  });
});
