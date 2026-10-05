import { describe, expect, it } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT,
  TOKENS_PER_MILLION,
  type IndexedModel,
  type IndexProvider,
} from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  MODEL_INTENTS,
  type ModelIntent,
} from '@knowtis/shared-types';

import { createIndexedModel } from '../../testing/create-indexed-model';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import {
  byNewestRelease,
  BYOK_SELECTORS,
  intentOfRow,
  isAssignableModel,
  isEligible,
  PLATFORM_SELECTORS,
  resolveByokIntent,
  resolvePlatformIntent,
  resolveSelector,
  type EligibilityRule,
  type ModelSelector,
} from './model-selectors';

const BYOK_REQUIRES = ['tool_call', 'structured_output'] as const;
const BYOK_RULE: EligibilityRule = { requires: BYOK_REQUIRES };
const PREVIEW_RULE: EligibilityRule = {
  requires: BYOK_REQUIRES,
  allowPreview: true,
};

const AUTHORS = ['anthropic', 'openai', 'google'] as const;
type Author = (typeof AUTHORS)[number];
type Route = 'direct' | 'openrouter';

const RESOLUTIONS: Readonly<
  Record<ModelIntent, Record<Route, Record<Author, string>>>
> = {
  fast: {
    direct: {
      anthropic: 'anthropic:claude-haiku-4-5',
      openai: 'openai:gpt-6-luna',
      google: 'google:gemini-3.5-flash-lite',
    },
    openrouter: {
      anthropic: 'openrouter:anthropic/claude-haiku-4.5',
      openai: 'openrouter:openai/gpt-6-luna',
      google: 'openrouter:google/gemini-3.5-flash-lite',
    },
  },
  balanced: {
    direct: {
      anthropic: 'anthropic:claude-sonnet-5-5',
      openai: 'openai:gpt-5.6-terra',
      google: 'google:gemini-3.8-flash',
    },
    openrouter: {
      anthropic: 'openrouter:anthropic/claude-sonnet-5.5',
      openai: 'openrouter:openai/gpt-5.6-terra',
      google: 'openrouter:google/gemini-3.8-flash',
    },
  },
  powerful: {
    direct: {
      anthropic: 'anthropic:claude-opus-5-5',
      openai: 'openai:gpt-6.1-sol',
      google: 'google:gemini-3.1-pro-preview',
    },
    openrouter: {
      anthropic: 'openrouter:anthropic/claude-opus-5.5',
      openai: 'openrouter:openai/gpt-6.1-sol',
      google: 'openrouter:google/gemini-3.1-pro-preview',
    },
  },
};

interface ResolutionCase {
  readonly intent: ModelIntent;
  readonly author: Author;
  readonly provider: IndexProvider;
  readonly expected: string;
}

const RESOLUTION_CASES: readonly ResolutionCase[] = MODEL_INTENTS.flatMap(
  (intent) =>
    AUTHORS.flatMap((author): ResolutionCase[] => [
      {
        intent,
        author,
        provider: author,
        expected: RESOLUTIONS[intent].direct[author],
      },
      {
        intent,
        author,
        provider: 'openrouter',
        expected: RESOLUTIONS[intent].openrouter[author],
      },
    ])
);

function row(id: string): IndexedModel {
  const found = MODEL_INDEX_SNAPSHOT.find((model) => model.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not in the model index snapshot`);
  }
  return found;
}

function otherwiseEligible(model: IndexedModel): IndexedModel {
  return {
    ...model,
    outputModalities: ['text'],
    toolCall: true,
    structuredOutput: true,
    status: 'active',
    retiresAt: null,
  };
}

function selectorOf(intent: ModelIntent, author: Author): ModelSelector {
  const selector = BYOK_SELECTORS[intent].find(
    (candidate) => candidate.author === author
  );
  if (selector === undefined) {
    throw new Error(`no ${author} selector for ${intent}`);
  }
  return selector;
}

function resolvedId(
  selector: ModelSelector,
  provider: IndexProvider,
  rows: readonly IndexedModel[] = MODEL_INDEX_SNAPSHOT
): string | null {
  return resolveSelector(selector, provider, rows, SNAPSHOT_DATE)?.id ?? null;
}

function expectIdRuleExcludes(
  model: IndexedModel,
  idWithoutToken: string,
  rule: EligibilityRule = BYOK_RULE
): void {
  expect(isEligible(model, rule, SNAPSHOT_DATE)).toBe(false);
  expect(isEligible(otherwiseEligible(model), rule, SNAPSHOT_DATE)).toBe(false);
  expect(
    isEligible(
      { ...otherwiseEligible(model), id: idWithoutToken },
      rule,
      SNAPSHOT_DATE
    )
  ).toBe(true);
}

describe('BYOK_SELECTORS', () => {
  it('lists the BYOK selectors per intent, in route order', () => {
    expect(BYOK_SELECTORS).toStrictEqual({
      fast: [
        {
          author: 'anthropic',
          families: ['claude-haiku'],
          maxOutputCostPerMillion: 6,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'openai',
          families: ['gpt-luna'],
          maxOutputCostPerMillion: 6,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'google',
          families: ['gemini-flash-lite'],
          maxOutputCostPerMillion: 6,
          requires: ['tool_call', 'structured_output'],
        },
      ],
      balanced: [
        {
          author: 'anthropic',
          families: ['claude-sonnet'],
          maxOutputCostPerMillion: 15,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'openai',
          families: ['gpt-terra'],
          maxOutputCostPerMillion: 15,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'google',
          families: ['gemini-flash'],
          maxOutputCostPerMillion: 15,
          requires: ['tool_call', 'structured_output'],
        },
      ],
      powerful: [
        {
          author: 'anthropic',
          families: ['claude-opus'],
          maxOutputCostPerMillion: 30,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'openai',
          families: ['gpt-sol'],
          maxOutputCostPerMillion: 30,
          requires: ['tool_call', 'structured_output'],
        },
        {
          author: 'google',
          families: ['gemini-pro'],
          maxOutputCostPerMillion: 30,
          requires: ['tool_call', 'structured_output'],
          allowPreview: true,
        },
      ],
    });
  });
});

describe('resolveSelector over the snapshot', () => {
  it.each(RESOLUTION_CASES)(
    'resolves $intent $author on $provider to $expected',
    ({ intent, author, provider, expected }) => {
      expect(resolvedId(selectorOf(intent, author), provider)).toBe(expected);
    }
  );

  it.each(
    MODEL_INTENTS.flatMap((intent) =>
      AUTHORS.flatMap((author) =>
        BYOK_PROVIDERS.filter(
          (provider) => provider !== author && provider !== 'openrouter'
        ).map((provider) => ({ intent, author, provider }))
      )
    )
  )(
    'gives null for $intent $author on $provider, neither its author nor openrouter',
    ({ intent, author, provider }) => {
      expect(resolvedId(selectorOf(intent, author), provider)).toBeNull();
    }
  );

  it('ignores an openrouter row of the family published under another author', () => {
    const resold = createIndexedModel({
      id: 'openrouter:reseller/claude-haiku-9',
      family: 'claude-haiku',
      releasedAt: '2027-01-01',
    });

    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'openrouter', [resold])
    ).toBeNull();
  });

  it('gives null on a direct provider that is not the author even when it lists the family', () => {
    const foreign = createIndexedModel({
      id: 'openai:claude-haiku-9',
      provider: 'openai',
      family: 'claude-haiku',
      releasedAt: '2027-01-01',
    });

    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'openai', [foreign])
    ).toBeNull();
  });

  it('ignores an openrouter row when resolving on the direct provider', () => {
    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'anthropic', [
        row('openrouter:anthropic/claude-haiku-4.5'),
      ])
    ).toBeNull();
  });

  it('ignores a direct row when resolving on openrouter, even one whose slug carries the author prefix', () => {
    const direct = createIndexedModel({
      id: 'anthropic:anthropic/claude-haiku-9',
      provider: 'anthropic',
      family: 'claude-haiku',
      releasedAt: '2027-01-01',
    });
    const selector = selectorOf('fast', 'anthropic');

    expect(resolvedId(selector, 'openrouter', [direct])).toBeNull();
    expect(
      resolvedId(selector, 'openrouter', [
        { ...direct, provider: 'openrouter' },
      ])
    ).toBe('anthropic:anthropic/claude-haiku-9');
  });

  it('gives the alias over its dated snapshot released the same day', () => {
    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'anthropic', [
        row('anthropic:claude-haiku-4-5-20251001'),
        row('anthropic:claude-haiku-4-5'),
      ])
    ).toBe('anthropic:claude-haiku-4-5');
  });

  it('gives the shorter id over a variant released the same day', () => {
    expect(
      resolvedId(selectorOf('balanced', 'openai'), 'openrouter', [
        row('openrouter:openai/gpt-5.6-terra-pro'),
        row('openrouter:openai/gpt-5.6-terra'),
      ])
    ).toBe('openrouter:openai/gpt-5.6-terra');
  });

  it('breaks a same-day, same-length tie by id order', () => {
    const later = createIndexedModel({
      id: 'openrouter:anthropic/claude-haiku-b',
      family: 'claude-haiku',
      releasedAt: '2026-01-01',
    });
    const earlier = createIndexedModel({
      id: 'openrouter:anthropic/claude-haiku-a',
      family: 'claude-haiku',
      releasedAt: '2026-01-01',
    });

    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'openrouter', [
        later,
        earlier,
      ])
    ).toBe('openrouter:anthropic/claude-haiku-a');
  });

  it('gives a dated row over one with no release date', () => {
    const undated = createIndexedModel({
      id: 'openrouter:anthropic/claude-haiku',
      family: 'claude-haiku',
      releasedAt: null,
    });
    const dated = createIndexedModel({
      id: 'openrouter:anthropic/claude-haiku-9',
      family: 'claude-haiku',
      releasedAt: '2020-01-01',
    });

    expect(
      resolvedId(selectorOf('fast', 'anthropic'), 'openrouter', [
        undated,
        dated,
      ])
    ).toBe('openrouter:anthropic/claude-haiku-9');
  });

  it('skips the newest kimi-k2, a -code variant, for the previous release', () => {
    const kimi: ModelSelector = {
      author: 'moonshotai',
      families: ['kimi-k2'],
      maxOutputCostPerMillion: 5,
      requires: BYOK_REQUIRES,
    };

    expect(resolvedId(kimi, 'openrouter')).toBe(
      'openrouter:moonshotai/kimi-k2.6'
    );
  });

  it('resolves gemini-pro without allowPreview to the last stable release, and to nothing on openrouter', () => {
    const stableGeminiPro: ModelSelector = {
      author: 'google',
      families: ['gemini-pro'],
      maxOutputCostPerMillion: 30,
      requires: BYOK_REQUIRES,
    };

    expect(resolvedId(stableGeminiPro, 'google')).toBe('google:gemini-2.5-pro');
    expect(resolvedId(stableGeminiPro, 'openrouter')).toBeNull();
  });

  it.each([
    ['an unknown input price', { inputCostPerToken: null }],
    ['a $0 output price', { outputCostPerToken: 0 }],
  ])(
    'falls back past a newest row with %s to the next eligible one',
    (_, unpriced) => {
      const newest = { ...row('anthropic:claude-sonnet-5-5'), ...unpriced };

      expect(
        resolvedId(selectorOf('balanced', 'anthropic'), 'anthropic', [
          newest,
          row('anthropic:claude-sonnet-5'),
        ])
      ).toBe('anthropic:claude-sonnet-5');
    }
  );

  it('still resolves gemini-pro on openrouter to the preview over its newer -customtools sibling', () => {
    expect(resolvedId(selectorOf('powerful', 'google'), 'openrouter')).toBe(
      'openrouter:google/gemini-3.1-pro-preview'
    );
  });
});

describe('resolveByokIntent', () => {
  it.each(MODEL_INTENTS)(
    'gives the anthropic route for %s to an openrouter-only key',
    (intent) => {
      expect(
        resolveByokIntent(
          intent,
          'openrouter',
          MODEL_INDEX_SNAPSHOT,
          SNAPSHOT_DATE
        )?.id
      ).toBe(RESOLUTIONS[intent].openrouter.anthropic);
    }
  );

  it.each(
    MODEL_INTENTS.flatMap((intent) =>
      AUTHORS.map((provider) => ({ intent, provider }))
    )
  )(
    'gives the $provider route for $intent to a $provider-only key',
    ({ intent, provider }) => {
      expect(
        resolveByokIntent(intent, provider, MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE)
          ?.id
      ).toBe(RESOLUTIONS[intent].direct[provider]);
    }
  );

  it('gives null when no selector of the intent resolves on the key', () => {
    expect(
      resolveByokIntent('fast', 'openrouter', [], SNAPSHOT_DATE)
    ).toBeNull();
  });
});

describe('isEligible', () => {
  it('excludes a -code id', () => {
    expectIdRuleExcludes(
      row('openrouter:moonshotai/kimi-k2.7-code'),
      'openrouter:moonshotai/kimi-k2.7'
    );
  });

  it.each([
    ['google:gemini-3-pro-image', 'google:gemini-3-pro'],
    ['google:gemini-3.1-flash-lite-image', 'google:gemini-3.1-flash-lite'],
  ])('excludes the -image id %s', (id, idWithoutToken) => {
    expectIdRuleExcludes(row(id), idWithoutToken);
  });

  it('excludes a -tts id', () => {
    expectIdRuleExcludes(
      row('google:gemini-3.1-flash-tts-preview'),
      'google:gemini-3.1-flash-preview',
      PREVIEW_RULE
    );
  });

  it('excludes a -live id', () => {
    expectIdRuleExcludes(
      row('google:gemini-3.1-flash-live-preview'),
      'google:gemini-3.1-flash-preview',
      PREVIEW_RULE
    );
  });

  it('excludes a -customtools id even where previews are allowed', () => {
    expectIdRuleExcludes(
      row('openrouter:google/gemini-3.1-pro-preview-customtools'),
      'openrouter:google/gemini-3.1-pro-preview',
      PREVIEW_RULE
    );
  });

  it('excludes a -vision id', () => {
    const visionExp = row('openrouter:deepseek/deepseek-v4-flash-vision-exp');

    expectIdRuleExcludes(
      { ...visionExp, id: 'openrouter:deepseek/deepseek-v4-flash-vision' },
      'openrouter:deepseek/deepseek-v4-flash'
    );
  });

  it('excludes an -exp id', () => {
    expectIdRuleExcludes(
      row('openrouter:deepseek/deepseek-v3.2-exp'),
      'openrouter:deepseek/deepseek-v3.2'
    );
  });

  it('excludes a -her id', () => {
    expectIdRuleExcludes(
      row('openrouter:minimax/minimax-m2-her'),
      'openrouter:minimax/minimax-m2'
    );
  });

  it('excludes a -batch id', () => {
    expectIdRuleExcludes(
      {
        ...row('anthropic:claude-haiku-4-5'),
        id: 'anthropic:claude-haiku-4-5-batch',
      },
      'anthropic:claude-haiku-4-5'
    );
  });

  it('excludes a -preview id unless the rule allows previews', () => {
    const preview = row('google:gemini-3.1-pro-preview');

    expect(isEligible(preview, BYOK_RULE, SNAPSHOT_DATE)).toBe(false);
    expect(isEligible(preview, PREVIEW_RULE, SNAPSHOT_DATE)).toBe(true);
  });

  it.each([
    'openrouter:anthropic/claude-opus-5.5:batch',
    'openrouter:cohere/north-mini-code:free',
  ])('excludes the :variant id %s', (id) => {
    expect(isEligible(row(id), BYOK_RULE, SNAPSHOT_DATE)).toBe(false);
    expect(
      isEligible(otherwiseEligible(row(id)), BYOK_RULE, SNAPSHOT_DATE)
    ).toBe(false);
  });

  it('excludes a ~ alias id', () => {
    const alias = row('openrouter:~anthropic/claude-opus-latest');

    expect(alias.family).toBe('claude-opus');
    expect(isEligible(alias, BYOK_RULE, SNAPSHOT_DATE)).toBe(false);
    expect(
      isEligible(
        { ...alias, id: 'openrouter:~anthropic/claude-opus-5.5' },
        BYOK_RULE,
        SNAPSHOT_DATE
      )
    ).toBe(false);
  });

  it.each([
    ['openai:gpt-daybreak-blue-latest', selectorOf('powerful', 'openai')],
    ['google:gemini-flash-lite-latest', selectorOf('fast', 'google')],
  ])('excludes the moving -latest alias %s', (id, selector) => {
    expect(isEligible(row(id), selector, SNAPSHOT_DATE)).toBe(false);
  });

  it.each([
    ['google:gemini-3.1-flash-lite-preview', PREVIEW_RULE],
    ['openai:gpt-4.1-nano', BYOK_RULE],
  ])('excludes the deprecated row %s', (id, rule) => {
    const deprecated = row(id);

    expect(deprecated.status).toBe('deprecated');
    expect(isEligible(deprecated, rule, SNAPSHOT_DATE)).toBe(false);
    expect(
      isEligible({ ...deprecated, status: 'active' }, rule, SNAPSHOT_DATE)
    ).toBe(true);
  });

  it('excludes an alpha row and keeps a beta one', () => {
    const haiku = row('anthropic:claude-haiku-4-5');

    expect(
      isEligible({ ...haiku, status: 'alpha' }, BYOK_RULE, SNAPSHOT_DATE)
    ).toBe(false);
    expect(
      isEligible({ ...haiku, status: 'beta' }, BYOK_RULE, SNAPSHOT_DATE)
    ).toBe(true);
  });

  it.each([
    ['2026-10-03T00:00:00Z', false],
    ['2026-09-20T00:00:00Z', false],
    ['2026-09-19T00:00:00Z', true],
  ])(
    'treats a row retiring on 2026-10-20 at %s as eligible: %s',
    (now, eligible) => {
      expect(
        isEligible(
          row('openrouter:google/gemini-2.5-pro'),
          BYOK_RULE,
          new Date(now)
        )
      ).toBe(eligible);
    }
  );

  it('excludes a row whose required capability is unknown', () => {
    const haiku = row('anthropic:claude-haiku-4-5');
    const computerUse = row('google:gemini-2.5-computer-use-preview-10-2025');

    expect(isEligible(haiku, BYOK_RULE, SNAPSHOT_DATE)).toBe(true);
    expect(
      isEligible({ ...haiku, toolCall: null }, BYOK_RULE, SNAPSHOT_DATE)
    ).toBe(false);
    expect(isEligible(computerUse, PREVIEW_RULE, SNAPSHOT_DATE)).toBe(false);
    expect(
      isEligible(
        { ...computerUse, structuredOutput: true },
        PREVIEW_RULE,
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it('checks only the capabilities the rule requires', () => {
    expect(
      isEligible(
        row('google:gemini-2.5-computer-use-preview-10-2025'),
        { requires: ['tool_call'], allowPreview: true },
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it('excludes a row that emits anything besides text', () => {
    const haiku = row('anthropic:claude-haiku-4-5');

    expect(
      isEligible(
        { ...haiku, outputModalities: ['text', 'image'] },
        BYOK_RULE,
        SNAPSHOT_DATE
      )
    ).toBe(false);
  });

  it('excludes a row that does not take text input', () => {
    const haiku = row('anthropic:claude-haiku-4-5');

    expect(
      isEligible(
        { ...haiku, inputModalities: ['image'] },
        BYOK_RULE,
        SNAPSHOT_DATE
      )
    ).toBe(false);
  });

  it('keeps a row priced exactly at the ceiling', () => {
    expect(
      isEligible(
        row('anthropic:claude-sonnet-4-6'),
        selectorOf('balanced', 'anthropic'),
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it.each([
    [9.99, false],
    [10, true],
  ])(
    'treats Sonnet 5.5 at $10/M under a %s ceiling as eligible: %s',
    (ceiling, eligible) => {
      expect(
        isEligible(
          row('anthropic:claude-sonnet-5-5'),
          { requires: BYOK_REQUIRES, maxOutputCostPerMillion: ceiling },
          SNAPSHOT_DATE
        )
      ).toBe(eligible);
    }
  );

  it('compares per token, so a price at a ceiling that drifts when scaled to per-million still qualifies', () => {
    const atCeiling = {
      ...row('anthropic:claude-haiku-4-5'),
      outputCostPerToken: 0.000123,
    };

    expect(atCeiling.outputCostPerToken * TOKENS_PER_MILLION).toBeGreaterThan(
      123
    );
    expect(
      isEligible(
        atCeiling,
        { requires: BYOK_REQUIRES, maxOutputCostPerMillion: 123 },
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it.each([
    ['an unknown input price', { inputCostPerToken: null }],
    ['a $0 input price', { inputCostPerToken: 0 }],
    ['an unknown output price', { outputCostPerToken: null }],
    ['a $0 output price', { outputCostPerToken: 0 }],
  ])('excludes a row with %s, with or without a ceiling', (_, unpriced) => {
    const haiku = { ...row('anthropic:claude-haiku-4-5'), ...unpriced };

    expect(
      isEligible(haiku, selectorOf('fast', 'anthropic'), SNAPSHOT_DATE)
    ).toBe(false);
    expect(isEligible(haiku, BYOK_RULE, SNAPSHOT_DATE)).toBe(false);
  });
});

describe('isAssignableModel', () => {
  const IMAGE_ROW = row('google:gemini-3-pro-image');

  it('assigns an eligible index row', () => {
    expect(
      isAssignableModel(row('anthropic:claude-haiku-4-5'), false, SNAPSHOT_DATE)
    ).toBe(true);
  });

  it('refuses an ineligible index row', () => {
    expect(isAssignableModel(IMAGE_ROW, false, SNAPSHOT_DATE)).toBe(false);
  });

  it('judges the retirement window at the given date', () => {
    const retiring = createIndexedModel({
      id: 'openrouter:vendor/retiring',
      retiresAt: '2026-10-20',
    });

    expect(
      isAssignableModel(retiring, false, new Date('2026-09-01T00:00:00Z'))
    ).toBe(true);
    expect(isAssignableModel(retiring, false, SNAPSHOT_DATE)).toBe(false);
  });

  it('lets a promoted id bypass an ineligible index row', () => {
    expect(isAssignableModel(IMAGE_ROW, true, SNAPSHOT_DATE)).toBe(true);
  });

  it('assigns an id with no index row', () => {
    expect(isAssignableModel(undefined, false, SNAPSHOT_DATE)).toBe(true);
  });
});

describe('intentOfRow', () => {
  it.each([
    ['anthropic:claude-sonnet-5-5', 'balanced'],
    ['openrouter:deepseek/deepseek-v4-pro-0813', 'balanced'],
    ['openrouter:deepseek/deepseek-v4.1-flash', 'fast'],
    ['openrouter:z-ai/glm-5.2', 'powerful'],
  ] as const)('classifies %s as %s', (id, intent) => {
    expect(intentOfRow(row(id))).toBe(intent);
  });

  it.each([
    'openrouter:z-ai/glm-5.3-flashx',
    'anthropic:claude-fable-5-1',
    'openrouter:moonshotai/kimi-k2.5',
  ])('classifies %s under no intent', (id) => {
    expect(intentOfRow(row(id))).toBeNull();
  });

  it('gives null to an openrouter row of another author in a selector family', () => {
    const foreign = {
      ...row('openrouter:z-ai/glm-5.2'),
      id: 'openrouter:vendor/glm-5.2',
    };
    expect(intentOfRow(foreign)).toBeNull();
  });
});

describe('byNewestRelease', () => {
  const OLDER = { releasedAt: '2026-01-31' };
  const NEWER = { releasedAt: '2026-02-01' };
  const UNDATED = { releasedAt: null };

  it('orders newer releases first and undated ones last', () => {
    expect([UNDATED, OLDER, NEWER].toSorted(byNewestRelease)).toEqual([
      NEWER,
      OLDER,
      UNDATED,
    ]);
  });

  it.each([
    ['the same date', OLDER, { releasedAt: OLDER.releasedAt }],
    ['no date', UNDATED, { releasedAt: null }],
  ])('ties two entries with %s', (_, a, b) => {
    expect(byNewestRelease(a, b)).toBe(0);
  });
});

const ABOVE_PRIME_CEILING_PER_MILLION = 10;

describe('PLATFORM_SELECTORS', () => {
  it.each([
    ['fast', 'openrouter:deepseek/deepseek-v4.1-flash'],
    ['balanced', 'openrouter:deepseek/deepseek-v4-pro-0813'],
    ['powerful', 'openrouter:z-ai/glm-5.3'],
  ] as const)('resolves the %s intent on the snapshot to %s', (intent, id) => {
    expect(
      resolvePlatformIntent(intent, MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE)?.id
    ).toBe(id);
  });

  it('never picks a flash-tier id its powerful family lists, however new', () => {
    const flashx = row('openrouter:z-ai/glm-5.3-flashx');

    expect(flashx.family).toBe('glm');
    expect(isEligible(flashx, PLATFORM_SELECTORS.powerful, SNAPSHOT_DATE)).toBe(
      false
    );
    expect(
      isEligible(
        flashx,
        { ...PLATFORM_SELECTORS.powerful, excludedIdTokens: [] },
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it('skips a powerful row above its ceiling', () => {
    const prime = row('openrouter:z-ai/glm-5.3-prime');

    expect(isEligible(prime, PLATFORM_SELECTORS.powerful, SNAPSHOT_DATE)).toBe(
      false
    );
    expect(
      isEligible(
        prime,
        {
          ...PLATFORM_SELECTORS.powerful,
          maxOutputCostPerMillion: ABOVE_PRIME_CEILING_PER_MILLION,
        },
        SNAPSHOT_DATE
      )
    ).toBe(true);
  });

  it('skips the newer vision-exp row of the fast family', () => {
    expect(
      isEligible(
        row('openrouter:deepseek/deepseek-v4-flash-vision-exp'),
        PLATFORM_SELECTORS.fast,
        SNAPSHOT_DATE
      )
    ).toBe(false);
  });

  it('falls back to the next row of the family when the newest leaves the index', () => {
    const rows = MODEL_INDEX_SNAPSHOT.filter(
      (model) => model.id !== 'openrouter:deepseek/deepseek-v4-pro-0813'
    );

    expect(resolvePlatformIntent('balanced', rows, SNAPSHOT_DATE)?.id).toBe(
      'openrouter:deepseek/deepseek-v4-pro'
    );
  });

  it('resolves nothing once the family leaves the index', () => {
    const rows = MODEL_INDEX_SNAPSHOT.filter(
      (model) => model.family !== 'deepseek-flash'
    );

    expect(resolvePlatformIntent('fast', rows, SNAPSHOT_DATE)).toBeNull();
  });

  it('resolves only the selector author on OpenRouter', () => {
    const foreign = {
      ...row('openrouter:z-ai/glm-5.3'),
      id: 'openrouter:acme/glm-5.3',
    };

    expect(
      resolvePlatformIntent('powerful', [foreign], SNAPSHOT_DATE)
    ).toBeNull();
  });

  it('keeps the BYOK-only rule free of the flash exclusion', () => {
    expect(
      resolveByokIntent('fast', 'google', MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE)
        ?.id
    ).toBe('google:gemini-3.5-flash-lite');
  });
});
