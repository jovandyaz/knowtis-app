import { describe, expect, it } from 'vitest';

import { INTENT_FALLBACK_ORDER } from '@knowtis/shared-types';

import type {
  UpstreamCatalog,
  UpstreamModel,
} from '../ports/openrouter-models.port';
import { OPENROUTER_ID_PREFIX } from './catalog-model';
import {
  canConcludeAbsence,
  findOpenRouterDrift,
  findPromotedDrift,
} from './openrouter-watch';
import { PLATFORM_SEED_MODELS } from './platform-resolution';
import { UNPARSEABLE_MODEL_ID } from './upstream-discards';

const UPSTREAM_OUTPUT_COST = 0.0000044;
const REPRICE_FACTOR = 3;

function upstreamModel(
  id: string,
  overrides: Partial<UpstreamModel> = {}
): UpstreamModel {
  return {
    id,
    name: id,
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    contextLength: 200_000,
    maxCompletionTokens: 32_768,
    promptCostPerToken: 0.0000006,
    completionCostPerToken: UPSTREAM_OUTPUT_COST,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    expirationDate: null,
    intelligenceIndex: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    reasoning: null,
    ...overrides,
  };
}

const MIN_WATCHED_MODELS = 2;

const WATCHED_IDS = INTENT_FALLBACK_ORDER.map(
  (intent) => PLATFORM_SEED_MODELS[intent]
).filter((id) => id.startsWith(OPENROUTER_ID_PREFIX));

const WATCHED_SLUGS = WATCHED_IDS.map((id) =>
  id.slice(OPENROUTER_ID_PREFIX.length).toLowerCase()
);

if (WATCHED_SLUGS.length < MIN_WATCHED_MODELS) {
  throw new Error('the watch spec needs two watched OpenRouter models');
}

const [WATCHED_SLUG] = WATCHED_SLUGS;
const WATCHED_ID = `${OPENROUTER_ID_PREFIX}${WATCHED_SLUG}`;
const RECOGNIZABLE_SLUG = 'deepseek/deepseek-v4-flash';

function catalogOf(
  models: readonly UpstreamModel[],
  overrides: Partial<UpstreamCatalog> = {}
): UpstreamCatalog {
  return { models, complete: true, discarded: [], ...overrides };
}

/** Every watched slug present and unremarkable, plus an unwatched platform-author row that keeps the read recognizable: a fixture that omits a watched slug asserts that model vanished. */
function upstreamInSync(overrides: UpstreamModel[] = []): UpstreamCatalog {
  const overridden = new Set(overrides.map((model) => model.id));
  return catalogOf([
    ...[...WATCHED_SLUGS, RECOGNIZABLE_SLUG]
      .filter((slug) => !overridden.has(slug))
      .map((slug) => upstreamModel(slug)),
    ...overrides,
  ]);
}

describe('findOpenRouterDrift', () => {
  it('should report no finding when upstream reprices a watched model', () => {
    const upstream = upstreamInSync([
      upstreamModel(WATCHED_SLUG, {
        completionCostPerToken: UPSTREAM_OUTPUT_COST * REPRICE_FACTOR,
      }),
    ]);

    expect(findOpenRouterDrift(upstream, WATCHED_IDS)).toEqual([]);
  });

  it('leaves an upstream expiration date to the retirement watch', () => {
    const upstream = upstreamInSync([
      upstreamModel(WATCHED_SLUG, {
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    ]);

    expect(findOpenRouterDrift(upstream, WATCHED_IDS)).toEqual([]);
  });

  it('should never watch a model billed outside OpenRouter', () => {
    expect(
      findOpenRouterDrift(upstreamInSync(), [
        ...WATCHED_IDS,
        'anthropic:claude-sonnet-5',
      ])
    ).toEqual([]);
  });

  it('should report a watched model that vanished from OpenRouter', () => {
    const upstream = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG)
    );

    const findings = findOpenRouterDrift(upstream, WATCHED_IDS);

    expect(findings).toEqual([
      {
        subject: WATCHED_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(WATCHED_SLUG),
      },
    ]);
  });

  it('should report every watched model that vanished, not just the first', () => {
    const findings = findOpenRouterDrift(
      catalogOf([
        upstreamModel(WATCHED_SLUG),
        upstreamModel(RECOGNIZABLE_SLUG),
      ]),
      WATCHED_IDS
    );

    expect(findings).toHaveLength(WATCHED_SLUGS.length - 1);
    expect(findings.every((finding) => finding.kind === 'unavailable')).toBe(
      true
    );
  });

  it('should conclude nothing from an empty upstream payload', () => {
    expect(findOpenRouterDrift(catalogOf([]), WATCHED_IDS)).toEqual([]);
  });

  it('should conclude no absence from a catalog that stopped paginating early', () => {
    const truncated = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG),
      { complete: false }
    );

    expect(findOpenRouterDrift(truncated, WATCHED_IDS)).toEqual([]);
  });

  it('should not call a model gone when upstream published it unparseably', () => {
    const dropped = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG),
      { discarded: [WATCHED_SLUG] }
    );

    expect(findOpenRouterDrift(dropped, WATCHED_IDS)).toEqual([]);
  });

  it('should conclude no absence from a read that lists no platform selector author', () => {
    const unrecognizable = catalogOf([
      upstreamModel('some-vendor/other-model'),
    ]);

    expect(findOpenRouterDrift(unrecognizable, WATCHED_IDS)).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the watched id', () => {
    const recased = catalogOf(
      upstreamInSync().models.map((model) =>
        model.id === WATCHED_SLUG
          ? upstreamModel(WATCHED_SLUG.toUpperCase())
          : upstreamModel(model.id)
      )
    );

    expect(findOpenRouterDrift(recased, WATCHED_IDS)).toEqual([]);
  });

  it('should not report a vanished model that is still listed', () => {
    const findings = findOpenRouterDrift(upstreamInSync(), WATCHED_IDS);

    expect(findings).toEqual([]);
  });

  it('watches only the ids it is given', () => {
    const read = catalogOf([upstreamModel('deepseek/deepseek-v4.1-flash')]);
    expect(findOpenRouterDrift(read, [])).toEqual([]);
    expect(findOpenRouterDrift(read, [WATCHED_ID])).toEqual([
      { subject: WATCHED_ID, kind: 'unavailable', detail: expect.any(String) },
    ]);
  });
});

describe('findPromotedDrift', () => {
  const PROMOTED_ID = 'openrouter:qwen/qwen3-max';
  const PROMOTED_SLUG = 'qwen/qwen3-max';

  it('should report a promoted model upstream stopped listing', () => {
    const findings = findPromotedDrift(
      [PROMOTED_ID],
      upstreamInSync(),
      WATCHED_IDS
    );

    expect(findings).toEqual([
      {
        subject: PROMOTED_ID,
        kind: 'unavailable',
        detail: expect.stringContaining(PROMOTED_SLUG),
      },
    ]);
  });

  it('should not report a promoted model that is still listed', () => {
    const listed = upstreamInSync([upstreamModel(PROMOTED_SLUG)]);

    expect(findPromotedDrift([PROMOTED_ID], listed, WATCHED_IDS)).toEqual([]);
  });

  it('should not conclude absence from a truncated catalog', () => {
    const truncated = catalogOf(upstreamInSync().models, { complete: false });

    expect(findPromotedDrift([PROMOTED_ID], truncated, WATCHED_IDS)).toEqual(
      []
    );
  });

  it('should not conclude absence for an id upstream published unparseably', () => {
    const discarded = catalogOf(upstreamInSync().models, {
      discarded: [PROMOTED_SLUG],
    });

    expect(findPromotedDrift([PROMOTED_ID], discarded, WATCHED_IDS)).toEqual(
      []
    );
  });

  it('should not conclude absence from a read that lists no platform selector author', () => {
    const unrecognizable = catalogOf([upstreamModel('some-vendor/other')]);

    expect(
      findPromotedDrift([PROMOTED_ID], unrecognizable, WATCHED_IDS)
    ).toEqual([]);
  });

  it('should match an upstream slug whose casing differs from the stored id', () => {
    const storedWithCasing = `${OPENROUTER_ID_PREFIX}Qwen/Qwen3-Max`;
    const listed = upstreamInSync([upstreamModel(PROMOTED_SLUG)]);

    expect(findPromotedDrift([storedWithCasing], listed, WATCHED_IDS)).toEqual(
      []
    );
  });

  it('should leave a promoted platform default to the drift watch', () => {
    const vanished = catalogOf(
      upstreamInSync().models.filter((model) => model.id !== WATCHED_SLUG)
    );

    expect(findPromotedDrift([WATCHED_ID], vanished, WATCHED_IDS)).toEqual([]);
    expect(findOpenRouterDrift(vanished, WATCHED_IDS)).toHaveLength(1);
  });

  it('should skip promoted ids that OpenRouter does not bill', () => {
    expect(
      findPromotedDrift(
        ['anthropic:claude-sonnet-5'],
        upstreamInSync(),
        WATCHED_IDS
      )
    ).toEqual([]);
  });

  it('should not conclude absence while an anonymous discard is present', () => {
    const anonymous = catalogOf(upstreamInSync().models, {
      discarded: [UNPARSEABLE_MODEL_ID],
    });

    expect(findPromotedDrift([PROMOTED_ID], anonymous, WATCHED_IDS)).toEqual(
      []
    );
    expect(findOpenRouterDrift(anonymous, WATCHED_IDS)).toEqual([]);
  });
});

describe('canConcludeAbsence', () => {
  it('should be true for a complete, recognizable, fully attributed read', () => {
    expect(canConcludeAbsence(upstreamInSync())).toBe(true);
  });

  it('should be false for a truncated read', () => {
    expect(
      canConcludeAbsence(
        catalogOf(upstreamInSync().models, { complete: false })
      )
    ).toBe(false);
  });

  it('cannot conclude absence from a read that lists no platform selector author', () => {
    expect(
      canConcludeAbsence(catalogOf([upstreamModel('qwen/qwen3.8-max-0902')]))
    ).toBe(false);
  });

  it('concludes absence from a complete read that lists a z-ai model only', () => {
    expect(canConcludeAbsence(catalogOf([upstreamModel('z-ai/glm-5.3')]))).toBe(
      true
    );
  });

  it('should be false while an anonymous discard is present', () => {
    expect(
      canConcludeAbsence(
        catalogOf(upstreamInSync().models, {
          discarded: [UNPARSEABLE_MODEL_ID],
        })
      )
    ).toBe(false);
  });
});
