import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fromOpenRouter,
  INDEX_PROVIDERS,
  MAX_INT32,
  MODEL_INDEX_SNAPSHOT,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
  type IndexProvider,
  type ModelsDevEnrichment,
} from '@knowtis/ai-gateway';
import { INTENT_FALLBACK_ORDER, MODEL_INTENTS } from '@knowtis/shared-types';

import {
  AI_MODEL_INDEX_COST_CEILING,
  AI_MODEL_INDEX_MAX_LENGTHS,
} from '../../../../database/schema/ai-model-index.schema';
import { OPENROUTER_ID_PREFIX } from '../../domain/model-catalog/catalog-model';
import { byokFloorKey } from '../../domain/model-catalog/floor-models';
import { resolveByokIntent } from '../../domain/model-catalog/model-selectors';
import {
  PLATFORM_SEED_MODELS,
  SELECTOR_KEY_BY_INTENT,
} from '../../domain/model-catalog/platform-resolution';
import {
  DISCARD_LOG_SAMPLE_SIZE,
  UNPARSEABLE_MODEL_ID,
} from '../../domain/model-catalog/upstream-discards';
import type { ModelIndexRepository } from '../../domain/ports/model-index.repository';
import type { ModelsDevCatalog } from '../../domain/ports/models-dev.port';
import type {
  UpstreamCatalog,
  UpstreamModel,
} from '../../domain/ports/openrouter-models.port';
import { PLATFORM_FLOOR_ROWS } from '../../testing/create-floor-rows';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import type { WebhookAlertService } from '../alerting/webhook-alert.service';
import { ModelIndexWriter } from './model-index.writer';

const QWEN_SLUG = 'qwen/qwen3.8-max';
const LARGEST_COST_BELOW_CEILING =
  AI_MODEL_INDEX_COST_CEILING * (1 - Number.EPSILON);
const DEEPSEEK_SLUG = 'deepseek/deepseek-v4-flash';

const WATCHED_SLUGS = INTENT_FALLBACK_ORDER.map(
  (intent) => PLATFORM_SEED_MODELS[intent]
)
  .filter((id) => id.startsWith(OPENROUTER_ID_PREFIX))
  .map((id) => id.slice(OPENROUTER_ID_PREFIX.length));

if (WATCHED_SLUGS.length === 0) {
  throw new Error('the writer spec needs a watched OpenRouter model');
}

const [WATCHED_SLUG] = WATCHED_SLUGS;
const WATCHED_ID = `openrouter:${WATCHED_SLUG}`;
const OPENROUTER_ROUTE_SLUGS = MODEL_INTENTS.flatMap((intent) => {
  const route = resolveByokIntent(
    intent,
    'openrouter',
    MODEL_INDEX_SNAPSHOT,
    SNAPSHOT_DATE
  );
  return route === null ? [] : [route.id.slice(OPENROUTER_ID_PREFIX.length)];
});

if (OPENROUTER_ROUTE_SLUGS.length !== MODEL_INTENTS.length) {
  throw new Error('the writer spec needs an OpenRouter route for every intent');
}
const OPENROUTER_ROUTE_KEYS = MODEL_INTENTS.map((intent) =>
  byokFloorKey(intent, 'openrouter')
);
const QWEN_ID = `openrouter:${QWEN_SLUG}`;
const PLATFORM_FLOOR_KEYS = MODEL_INTENTS.map(
  (intent) => SELECTOR_KEY_BY_INTENT[intent]
);
const PLATFORM_SLUGS = PLATFORM_FLOOR_ROWS.map((row) =>
  row.id.slice(OPENROUTER_ID_PREFIX.length)
);
const [, BALANCED_PLATFORM_ROW] = PLATFORM_FLOOR_ROWS;
const BALANCED_PLATFORM_SLUG = BALANCED_PLATFORM_ROW.id.slice(
  OPENROUTER_ID_PREFIX.length
);

function upstreamModel(id: string): UpstreamModel {
  return {
    id,
    name: id,
    description: 'An open-weight model.',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    contextLength: 262_144,
    maxCompletionTokens: 65_536,
    promptCostPerToken: 0.0000012,
    completionCostPerToken: 0.000006,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    expirationDate: null,
    intelligenceIndex: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    reasoning: null,
  };
}

function routeModel(id: string): UpstreamModel {
  return {
    ...upstreamModel(id),
    supportedParameters: ['tools', 'structured_outputs'],
  };
}

/** The OpenRouter read of a platform floor row: its own prices, window, release and capabilities. */
function platformModel(slug: string): UpstreamModel {
  const row = PLATFORM_FLOOR_ROWS.find(
    (floor) => floor.id === `${OPENROUTER_ID_PREFIX}${slug}`
  );
  if (row === undefined) {
    throw new Error(`the writer spec needs the platform floor row ${slug}`);
  }
  return {
    ...upstreamModel(slug),
    createdAt: new Date(`${row.releasedAt}T00:00:00.000Z`),
    promptCostPerToken: row.inputCostPerToken ?? 0,
    completionCostPerToken: row.outputCostPerToken ?? 0,
    contextLength: row.maxInputTokens ?? 0,
    maxCompletionTokens: row.maxOutputTokens,
    inputModalities: row.inputModalities,
    supportedParameters: ['tools', 'structured_outputs'],
  };
}

function openRouterCatalog(
  overrides: Partial<UpstreamCatalog> = {}
): UpstreamCatalog {
  return {
    models: [
      upstreamModel(WATCHED_SLUG),
      upstreamModel(QWEN_SLUG),
      upstreamModel(DEEPSEEK_SLUG),
      ...PLATFORM_SLUGS.map(platformModel),
    ],
    complete: true,
    discarded: [],
    ...overrides,
  };
}

function directModel(
  provider: IndexProvider,
  slug: string,
  family = slug
): IndexedModel {
  return {
    id: `${provider}:${slug}`,
    provider,
    name: slug,
    family,
    releasedAt: '2026-01-01',
    status: 'active',
    toolCall: true,
    structuredOutput: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    inputCostPerToken: 0.000001,
    outputCostPerToken: 0.000005,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    maxInputTokens: 200_000,
    maxOutputTokens: 64_000,
    reasoning: null,
    canonical: `${provider}/${slug}`,
    openWeights: false,
    retiresAt: null,
    source: 'models_dev',
  };
}

const CLAUDE = directModel('anthropic', 'claude-sonnet-5', 'claude-sonnet');
const CLAUDE_ROUTE_KEY = byokFloorKey('balanced', 'anthropic');
const GPT = directModel('openai', 'gpt-5.4');
const GEMINI = directModel('google', 'gemini-3-pro');
const CLAUDE_NEXT = directModel('anthropic', 'claude-next');
const GPT_MINI = directModel('openai', 'gpt-5.4-mini');

const LISTED_ROWS: readonly IndexedModel[] = [
  CLAUDE,
  GPT,
  GEMINI,
  ...openRouterCatalog()
    .models.filter((model) => !PLATFORM_SLUGS.includes(model.id))
    .map((model) => fromOpenRouter(model, null)),
  ...PLATFORM_FLOOR_ROWS,
];
const OPENROUTER_ROWS = openRouterCatalog().models.length;

const SNAPSHOT_OPENROUTER_SLUGS = MODEL_INDEX_SNAPSHOT.filter(
  (row) => row.provider === 'openrouter'
).map((row) => row.id.slice(OPENROUTER_ID_PREFIX.length));

/** A first OpenRouter read as large as the snapshot rows it replaces. */
const FRESH_OPENROUTER_MODELS = [
  ...SNAPSHOT_OPENROUTER_SLUGS.filter(
    (slug) => !PLATFORM_SLUGS.includes(slug)
  ).map(routeModel),
  ...PLATFORM_SLUGS.map(platformModel),
];

function modelsDevCatalog(
  overrides: Partial<ModelsDevCatalog> = {}
): ModelsDevCatalog {
  return {
    models: [CLAUDE, GPT, GEMINI],
    openRouterEnrichment: new Map(),
    discarded: [],
    ...overrides,
  };
}

function make(listed: readonly IndexedModel[] = LISTED_ROWS) {
  const repo = {
    upsertMany: vi.fn<ModelIndexRepository['upsertMany']>(
      async (rows) => rows.length
    ),
    markAbsent: vi
      .fn<ModelIndexRepository['markAbsent']>()
      .mockResolvedValue([]),
    listListed: vi
      .fn<ModelIndexRepository['listListed']>()
      .mockResolvedValue([...listed]),
  };
  const alerts = { notify: vi.fn<WebhookAlertService['notify']>() };
  return {
    writer: new ModelIndexWriter(
      repo,
      alerts as unknown as WebhookAlertService
    ),
    repo,
    alerts,
  };
}

function upsertedIds(repo: ReturnType<typeof make>['repo']): string[] {
  const [rows] = repo.upsertMany.mock.calls[0] ?? [[]];
  return rows.map((row) => row.id);
}

function retiredIds(provider: IndexProvider, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${provider}:retired-${index}`
  );
}

function absenceConcludedFor(
  repo: ReturnType<typeof make>['repo']
): IndexProvider[] {
  return repo.markAbsent.mock.calls.map(([provider]) => provider);
}

describe('ModelIndexWriter', () => {
  let logLog: ReturnType<typeof vi.spyOn>;
  let warnLog: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
    logLog = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnLog = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should index every provider and conclude absence for each on a clean read', async () => {
    const { writer, repo } = make();

    const expectedIds = [
      CLAUDE.id,
      GPT.id,
      GEMINI.id,
      `openrouter:${WATCHED_SLUG}`,
      `openrouter:${QWEN_SLUG}`,
      `openrouter:${DEEPSEEK_SLUG}`,
      ...PLATFORM_FLOOR_ROWS.map((row) => row.id),
    ];

    const result = await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(upsertedIds(repo).sort()).toEqual([...expectedIds].sort());
    expect(absenceConcludedFor(repo).sort()).toEqual(
      [...INDEX_PROVIDERS].sort()
    );
    const { concluded, ...counts } = result;
    expect(counts).toEqual({
      indexed: expectedIds.length,
      absent: 0,
      rejected: [],
    });
    expect([...concluded].sort()).toEqual([...INDEX_PROVIDERS].sort());
  });

  it('should stamp the upserts and every absence with one seenAt', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    const [, seenAt] = repo.upsertMany.mock.calls[0] ?? [];
    expect(seenAt).toBeInstanceOf(Date);
    expect(repo.markAbsent).toHaveBeenCalledTimes(INDEX_PROVIDERS.length);
    for (const [, absentSeenAt] of repo.markAbsent.mock.calls) {
      expect(absentSeenAt).toBe(seenAt);
    }
  });

  it('should read the listed rows once, before it upserts', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(repo.listListed).toHaveBeenCalledOnce();
    const [listedAt = Infinity] = repo.listListed.mock.invocationCallOrder;
    const [upsertedAt = -Infinity] = repo.upsertMany.mock.invocationCallOrder;
    expect(listedAt).toBeLessThan(upsertedAt);
  });

  it('should mark absences only after every row is upserted', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    const [upsertedAt = Infinity] = repo.upsertMany.mock.invocationCallOrder;
    expect(repo.markAbsent).toHaveBeenCalled();
    for (const markedAt of repo.markAbsent.mock.invocationCallOrder) {
      expect(markedAt).toBeGreaterThan(upsertedAt);
    }
  });

  it('should report how many rows the absences retired', async () => {
    const { writer, repo } = make();
    repo.markAbsent.mockImplementation(async (provider: IndexProvider) =>
      retiredIds(provider, provider === 'openrouter' ? 3 : 1)
    );

    const result = await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(result.absent).toBe(6);
    expect(logLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync',
      indexed:
        openRouterCatalog().models.length + modelsDevCatalog().models.length,
      absent: 6,
    });
  });

  it('should log a sample of the ids each provider newly retired', async () => {
    const { writer, repo } = make();
    const retired = retiredIds('openrouter', DISCARD_LOG_SAMPLE_SIZE + 1);
    repo.markAbsent.mockImplementation(async (provider: IndexProvider) =>
      provider === 'openrouter' ? retired : []
    );

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(logLog).toHaveBeenCalledWith({
      event: 'ai.model_index.marked_absent',
      provider: 'openrouter',
      count: retired.length,
      models: retired.slice(0, DISCARD_LOG_SAMPLE_SIZE),
    });
    expect(logLog).toHaveBeenCalledTimes(2);
  });

  it('should index only OpenRouter and touch no direct provider when models.dev failed', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), null);

    expect(upsertedIds(repo).sort()).toEqual(
      [
        `openrouter:${WATCHED_SLUG}`,
        `openrouter:${QWEN_SLUG}`,
        `openrouter:${DEEPSEEK_SLUG}`,
        ...PLATFORM_FLOOR_ROWS.map((row) => row.id),
      ].sort()
    );
    expect(absenceConcludedFor(repo)).toEqual(['openrouter']);
    expect(warnLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_index.sync_rejected' })
    );
  });

  it('writes the models.dev batches alone when the OpenRouter read is missing', async () => {
    const { writer, repo } = make(LISTED_ROWS);
    const result = await writer.write(null, modelsDevCatalog());
    expect(upsertedIds(repo).sort()).toEqual(
      modelsDevCatalog()
        .models.map((row) => row.id)
        .sort()
    );
    expect(absenceConcludedFor(repo).sort()).toEqual(
      [...MODELS_DEV_PROVIDERS].sort()
    );
    expect([...result.concluded].sort()).toEqual(
      [...MODELS_DEV_PROVIDERS].sort()
    );
  });

  it('should conclude no absence anywhere when models.dev failed and OpenRouter is inconclusive', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog({ complete: false }), null);

    expect(repo.upsertMany).toHaveBeenCalledTimes(1);
    expect(repo.markAbsent).not.toHaveBeenCalled();
  });

  it('should index an OpenRouter model models.dev does not know with no family', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    const [rows] = repo.upsertMany.mock.calls[0] ?? [[]];
    expect(rows.find((row) => row.id === `openrouter:${QWEN_SLUG}`)).toEqual(
      expect.objectContaining({
        provider: 'openrouter',
        family: null,
        canonical: 'qwen/qwen3-8-max',
        inputCostPerToken: 0.0000012,
        outputCostPerToken: 0.000006,
      })
    );
  });

  describe('OpenRouter enrichment carried forward', () => {
    const CLAUDE_SLUG = 'anthropic/claude-sonnet-5.5';
    const CLAUDE_OPENROUTER_ID = `${OPENROUTER_ID_PREFIX}${CLAUDE_SLUG}`;
    const SNAPSHOT_SLUG = 'amazon/nova-2-lite-v1';
    const SNAPSHOT_OPENROUTER_ID = `${OPENROUTER_ID_PREFIX}${SNAPSHOT_SLUG}`;

    const listedClaude: IndexedModel = fromOpenRouter(
      upstreamModel(CLAUDE_SLUG),
      {
        family: 'claude-sonnet',
        canonical: 'anthropic/claude-sonnet-5',
        openWeights: true,
        status: 'deprecated',
      }
    );
    const CARRIED_FIELDS = {
      family: 'claude-sonnet',
      canonical: 'anthropic/claude-sonnet-5',
      openWeights: true,
      status: 'deprecated',
    };

    function catalogWithClaude(): UpstreamCatalog {
      return openRouterCatalog({
        models: [...openRouterCatalog().models, upstreamModel(CLAUDE_SLUG)],
      });
    }

    function upsertedRow(
      repo: ReturnType<typeof make>['repo'],
      id: string
    ): IndexedModel | undefined {
      const [rows] = repo.upsertMany.mock.calls[0] ?? [[]];
      return rows.find((row) => row.id === id);
    }

    it('should keep every stored enrichment field when models.dev failed', async () => {
      const { writer, repo } = make([...LISTED_ROWS, listedClaude]);

      await writer.write(catalogWithClaude(), null);

      expect(upsertedRow(repo, CLAUDE_OPENROUTER_ID)).toEqual(
        expect.objectContaining(CARRIED_FIELDS)
      );
    });

    it('should keep every stored enrichment field when models.dev has no entry for the model', async () => {
      const { writer, repo } = make([...LISTED_ROWS, listedClaude]);

      await writer.write(catalogWithClaude(), modelsDevCatalog());

      expect(upsertedRow(repo, CLAUDE_OPENROUTER_ID)).toEqual(
        expect.objectContaining(CARRIED_FIELDS)
      );
    });

    it('should prefer the models.dev entry over the stored family', async () => {
      const { writer, repo } = make([...LISTED_ROWS, listedClaude]);
      const enrichment: ModelsDevEnrichment = {
        family: 'claude-sonnet-next',
        canonical: 'anthropic/claude-sonnet-5-5',
        openWeights: false,
        status: 'active',
      };

      await writer.write(
        catalogWithClaude(),
        modelsDevCatalog({
          openRouterEnrichment: new Map([[CLAUDE_SLUG, enrichment]]),
        })
      );

      expect(upsertedRow(repo, CLAUDE_OPENROUTER_ID)?.family).toBe(
        'claude-sonnet-next'
      );
    });

    it('should index a model with no stored row and no entry with a null family', async () => {
      const { writer, repo } = make();

      await writer.write(catalogWithClaude(), null);

      expect(upsertedRow(repo, CLAUDE_OPENROUTER_ID)?.family).toBeNull();
    });

    it('should carry the family from the snapshot row while OpenRouter lists none', async () => {
      const snapshotFamily = MODEL_INDEX_SNAPSHOT.find(
        (row) => row.id === SNAPSHOT_OPENROUTER_ID
      )?.family;
      const { writer, repo } = make(
        LISTED_ROWS.filter((row) => row.provider !== 'openrouter')
      );

      await writer.write(
        openRouterCatalog({ models: FRESH_OPENROUTER_MODELS }),
        null
      );

      expect(snapshotFamily).toBeTruthy();
      expect(upsertedRow(repo, SNAPSHOT_OPENROUTER_ID)?.family).toBe(
        snapshotFamily
      );
    });
  });

  it('should enrich an OpenRouter model models.dev describes', async () => {
    const { writer, repo } = make();
    const enrichment: ModelsDevEnrichment = {
      family: 'deepseek',
      canonical: 'deepseek/deepseek-v4-flash',
      openWeights: true,
      status: 'beta',
    };

    await writer.write(
      openRouterCatalog({
        models: [
          ...PLATFORM_SLUGS.map(platformModel),
          upstreamModel(DEEPSEEK_SLUG),
        ],
      }),
      modelsDevCatalog({
        openRouterEnrichment: new Map([[DEEPSEEK_SLUG, enrichment]]),
      })
    );

    const [rows] = repo.upsertMany.mock.calls[0] ?? [[]];
    expect(
      rows.find((row) => row.id === `openrouter:${DEEPSEEK_SLUG}`)
    ).toEqual(
      expect.objectContaining({
        family: 'deepseek',
        openWeights: true,
        status: 'beta',
      })
    );
  });

  it('should still upsert the direct providers but conclude no absence for them when models.dev discarded an entry', async () => {
    const { writer, repo } = make();

    const result = await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ discarded: ['openai:<unparseable>'] })
    );

    expect(upsertedIds(repo)).toEqual(
      expect.arrayContaining([CLAUDE.id, GPT.id, GEMINI.id])
    );
    expect(absenceConcludedFor(repo)).toEqual(['openrouter']);
    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'inconclusive' },
      { provider: 'openai', reason: 'inconclusive' },
      { provider: 'google', reason: 'inconclusive' },
    ]);
  });

  it('should neither rewrite nor retire the listed row of a model OpenRouter discarded', async () => {
    const { writer, repo } = make();

    await writer.write(
      openRouterCatalog({
        models: openRouterCatalog().models.filter(
          (model) => model.id !== QWEN_SLUG
        ),
        discarded: [QWEN_SLUG],
      }),
      modelsDevCatalog()
    );

    expect(LISTED_ROWS.map((row) => row.id)).toContain(QWEN_ID);
    expect(upsertedIds(repo)).not.toContain(QWEN_ID);
    expect(absenceConcludedFor(repo)).toContain('openrouter');
    expect(repo.markAbsent).toHaveBeenCalledWith(
      'openrouter',
      expect.any(Date),
      [QWEN_ID]
    );
  });

  it('should warn with the counts behind a rejection on an inconclusive OpenRouter read', async () => {
    const { writer, repo } = make();

    await writer.write(
      openRouterCatalog({ discarded: [UNPARSEABLE_MODEL_ID] }),
      modelsDevCatalog()
    );

    expect(absenceConcludedFor(repo)).not.toContain('openrouter');
    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'openrouter',
      reason: 'inconclusive',
      rows: OPENROUTER_ROWS,
      previous: OPENROUTER_ROWS,
    });
  });

  it('should keep a provider listed whose rows shrank by more than half', async () => {
    const { writer, repo } = make([
      ...LISTED_ROWS,
      directModel('anthropic', 'claude-earlier'),
      directModel('anthropic', 'claude-earliest'),
    ]);

    const result = await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(upsertedIds(repo)).toContain(CLAUDE.id);
    expect(absenceConcludedFor(repo)).not.toContain('anthropic');
    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'shrink' },
    ]);
    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'anthropic',
      reason: 'shrink',
      rows: 1,
      previous: 3,
    });
  });

  it('should write none of an OpenRouter batch whose rows lost their input modalities', async () => {
    const { writer, repo } = make();
    const textless = openRouterCatalog().models.map((model) => ({
      ...model,
      inputModalities: [],
    }));

    const result = await writer.write(
      openRouterCatalog({ models: textless }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo).sort()).toEqual(
      [CLAUDE.id, GPT.id, GEMINI.id].sort()
    );
    expect(absenceConcludedFor(repo)).not.toContain('openrouter');
    expect(result.rejected).toEqual([
      { provider: 'openrouter', reason: 'floor', models: PLATFORM_FLOOR_KEYS },
    ]);
    expect(errorLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'openrouter',
      reason: 'floor',
      models: PLATFORM_FLOOR_KEYS,
      rows: OPENROUTER_ROWS,
      previous: OPENROUTER_ROWS,
    });
  });

  it('should write none of an OpenRouter batch whose platform rows lost tool calling and structured output', async () => {
    const { writer, repo } = make();
    const toolless = openRouterCatalog().models.map((model) =>
      PLATFORM_SLUGS.includes(model.id)
        ? { ...model, supportedParameters: [] }
        : model
    );

    const result = await writer.write(
      openRouterCatalog({ models: toolless }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo).sort()).toEqual(
      [CLAUDE.id, GPT.id, GEMINI.id].sort()
    );
    expect(result.rejected).toEqual([
      { provider: 'openrouter', reason: 'floor', models: PLATFORM_FLOOR_KEYS },
    ]);
  });

  it('should write none of a batch that drops the only route its provider serves for a BYOK intent', async () => {
    const { writer, repo } = make();

    const result = await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [CLAUDE_NEXT, GPT, GEMINI] })
    );

    expect(upsertedIds(repo)).not.toContain(CLAUDE_NEXT.id);
    expect(absenceConcludedFor(repo)).not.toContain('anthropic');
    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'floor', models: [CLAUDE_ROUTE_KEY] },
    ]);
  });

  it('should alert once per provider whose batch the floor rejects, naming what it would leave unserved', async () => {
    const { writer, alerts } = make();
    const textless = openRouterCatalog().models.map((model) => ({
      ...model,
      inputModalities: [],
    }));

    await writer.write(
      openRouterCatalog({ models: textless }),
      modelsDevCatalog({ models: [CLAUDE_NEXT, GPT, GEMINI] })
    );

    expect(alerts.notify).toHaveBeenCalledTimes(2);
    expect(alerts.notify).toHaveBeenCalledWith('model_index.floor_rejected', {
      provider: 'anthropic',
      models: [CLAUDE_ROUTE_KEY],
    });
    expect(alerts.notify).toHaveBeenCalledWith('model_index.floor_rejected', {
      provider: 'openrouter',
      models: PLATFORM_FLOOR_KEYS,
    });
  });

  it('should raise no alert for a rejection that only withholds absence', async () => {
    const { writer, alerts } = make([
      ...LISTED_ROWS,
      directModel('anthropic', 'claude-earlier'),
      directModel('anthropic', 'claude-earliest'),
    ]);

    const result = await writer.write(
      openRouterCatalog({ discarded: [UNPARSEABLE_MODEL_ID] }),
      modelsDevCatalog()
    );

    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'shrink' },
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it('should raise no alert on a clean read', async () => {
    const { writer, alerts } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it('should accept a batch that still serves its provider floor models under new facts', async () => {
    const { writer, repo } = make();
    const repriced = openRouterCatalog().models.map((model) => ({
      ...model,
      promptCostPerToken: model.promptCostPerToken * 2,
      contextLength: model.contextLength / 2,
    }));

    const result = await writer.write(
      openRouterCatalog({ models: repriced }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo)).toContain(WATCHED_ID);
    expect(absenceConcludedFor(repo)).toContain('openrouter');
    expect(result.rejected).toEqual([]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('should hold a provider with no listed rows to the floor models its snapshot rows serve', async () => {
    const { writer, repo } = make(
      LISTED_ROWS.filter((row) => row.provider !== 'openrouter')
    );

    const result = await writer.write(
      openRouterCatalog({
        models: [
          upstreamModel(WATCHED_SLUG),
          upstreamModel(QWEN_SLUG),
          upstreamModel(DEEPSEEK_SLUG),
        ],
      }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo)).not.toContain(WATCHED_ID);
    expect(absenceConcludedFor(repo)).not.toContain('openrouter');
    expect(result.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [...PLATFORM_FLOOR_KEYS, ...OPENROUTER_ROUTE_KEYS],
      },
    ]);
  });

  it('should accept a provider with no listed rows whose batch serves what its snapshot rows serve', async () => {
    const { writer, repo } = make(
      LISTED_ROWS.filter((row) => row.provider !== 'openrouter')
    );

    const result = await writer.write(
      openRouterCatalog({ models: FRESH_OPENROUTER_MODELS }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo)).toEqual(
      expect.arrayContaining(
        FRESH_OPENROUTER_MODELS.map(
          (model) => `${OPENROUTER_ID_PREFIX}${model.id}`
        )
      )
    );
    expect(absenceConcludedFor(repo)).toContain('openrouter');
    expect(result.rejected).toEqual([]);
    expect(result.concluded).toContain('openrouter');
  });

  it('should hold a first OpenRouter batch to the snapshot rows it replaces, so a tiny read concludes nothing', async () => {
    const tiny = [
      ...PLATFORM_SLUGS.map(platformModel),
      ...OPENROUTER_ROUTE_SLUGS.map(routeModel),
      upstreamModel(DEEPSEEK_SLUG),
    ];
    const { writer, repo } = make([]);

    const result = await writer.write(
      openRouterCatalog({ models: tiny }),
      null
    );

    expect(result.rejected).toEqual([
      { provider: 'openrouter', reason: 'shrink' },
    ]);
    expect(absenceConcludedFor(repo)).toEqual([]);
    expect(result.concluded).toEqual([]);
    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'openrouter',
      reason: 'shrink',
      rows: tiny.length,
      previous: SNAPSHOT_OPENROUTER_SLUGS.length,
    });
  });

  it('names no provider whose first batch was inconclusive', async () => {
    const { writer, repo } = make(
      LISTED_ROWS.filter((row) => row.provider !== 'openrouter')
    );
    const result = await writer.write(
      openRouterCatalog({ models: FRESH_OPENROUTER_MODELS, complete: false }),
      modelsDevCatalog()
    );
    expect(result.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
    expect(absenceConcludedFor(repo)).not.toContain('openrouter');
    expect(result.concluded).not.toContain('openrouter');
  });

  it.each([
    {
      column: 'id',
      row: {
        ...GPT,
        id: `openai:${'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.id)}`,
      },
    },
    {
      column: 'name',
      row: { ...GPT, name: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.name + 1) },
    },
    {
      column: 'family',
      row: {
        ...GPT,
        family: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.family + 1),
      },
    },
    {
      column: 'canonical',
      row: {
        ...GPT,
        canonical: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.canonical + 1),
      },
    },
    {
      column: 'maxInputTokens',
      row: { ...GPT, maxInputTokens: MAX_INT32 + 1 },
    },
    { column: 'maxOutputTokens', row: { ...GPT, maxOutputTokens: 1.5 } },
    {
      column: 'inputCostPerToken',
      row: { ...GPT, inputCostPerToken: AI_MODEL_INDEX_COST_CEILING },
    },
    {
      column: 'cacheReadCostPerToken',
      row: { ...GPT, cacheReadCostPerToken: Number.NaN },
    },
  ])(
    'should skip a row whose $column does not fit its column, write the rest and keep it from absence',
    async ({ row }) => {
      const { writer, repo } = make();

      await writer.write(
        openRouterCatalog(),
        modelsDevCatalog({ models: [CLAUDE, row, GPT_MINI, GEMINI] })
      );

      expect(upsertedIds(repo)).not.toContain(row.id);
      expect(upsertedIds(repo)).toEqual(
        expect.arrayContaining([CLAUDE.id, GEMINI.id, WATCHED_ID])
      );
      expect(repo.markAbsent).toHaveBeenCalledWith('openai', expect.any(Date), [
        row.id,
      ]);
      expect(warnLog).toHaveBeenCalledWith({
        event: 'ai.model_index.rows_skipped',
        provider: 'openai',
        count: 1,
        models: [row.id],
      });
    }
  );

  it('should write a row whose values fill their columns exactly', async () => {
    const { writer, repo } = make();
    const filled: IndexedModel = {
      ...GPT,
      name: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.name),
      family: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.family),
      canonical: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.canonical),
      maxInputTokens: MAX_INT32,
      maxOutputTokens: MAX_INT32,
      inputCostPerToken: LARGEST_COST_BELOW_CEILING,
      outputCostPerToken: LARGEST_COST_BELOW_CEILING,
    };

    await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [CLAUDE, filled, GEMINI] })
    );

    expect(upsertedIds(repo)).toContain(filled.id);
    expect(warnLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_index.rows_skipped' })
    );
  });

  it('should log a sample of the skipped ids', async () => {
    const { writer } = make();
    const overflowing = Array.from(
      { length: DISCARD_LOG_SAMPLE_SIZE + 1 },
      (_, index) => ({
        ...directModel('openai', `overflowing-${index}`),
        name: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.name + 1),
      })
    );

    await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [CLAUDE, GPT, GEMINI, ...overflowing] })
    );

    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.rows_skipped',
      provider: 'openai',
      count: overflowing.length,
      models: overflowing
        .slice(0, DISCARD_LOG_SAMPLE_SIZE)
        .map((row) => row.id),
    });
  });

  it('should log the skipped rows once per provider', async () => {
    const { writer } = make();
    const overflowingName = 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.name + 1);
    const openai = { ...GPT_MINI, name: overflowingName };
    const google = {
      ...directModel('google', 'gemini-next'),
      name: overflowingName,
    };

    await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [CLAUDE, GPT, openai, GEMINI, google] })
    );

    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.rows_skipped',
      provider: 'openai',
      count: 1,
      models: [openai.id],
    });
    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.rows_skipped',
      provider: 'google',
      count: 1,
      models: [google.id],
    });
  });

  it('should accept a batch whose discarded floor model keeps its served listed row', async () => {
    const { writer, repo } = make();

    const result = await writer.write(
      openRouterCatalog({
        models: openRouterCatalog().models.filter(
          (model) => model.id !== BALANCED_PLATFORM_SLUG
        ),
        discarded: [BALANCED_PLATFORM_SLUG],
      }),
      modelsDevCatalog()
    );

    expect(result.rejected).toEqual([]);
    expect(upsertedIds(repo)).toEqual(
      expect.arrayContaining([WATCHED_ID, QWEN_ID])
    );
    expect(upsertedIds(repo)).not.toContain(BALANCED_PLATFORM_ROW.id);
    expect(repo.markAbsent).toHaveBeenCalledWith(
      'openrouter',
      expect.any(Date),
      [BALANCED_PLATFORM_ROW.id]
    );
  });

  it('should reject a batch whose discarded floor model has no listed row to keep', async () => {
    const balancedFamilySlugs = MODEL_INDEX_SNAPSHOT.filter(
      (row) =>
        row.provider === 'openrouter' &&
        row.family === BALANCED_PLATFORM_ROW.family
    ).map((row) => row.id.slice(OPENROUTER_ID_PREFIX.length));
    const { writer, repo } = make(
      LISTED_ROWS.filter((row) => row.provider !== 'openrouter')
    );

    const result = await writer.write(
      openRouterCatalog({
        models: FRESH_OPENROUTER_MODELS.filter(
          (model) => !balancedFamilySlugs.includes(model.id)
        ),
        discarded: [BALANCED_PLATFORM_SLUG],
      }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo).some((id) => id.startsWith('openrouter:'))).toBe(
      false
    );
    expect(result.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [SELECTOR_KEY_BY_INTENT.balanced],
      },
    ]);
  });

  it('should reject a batch whose only route for a BYOK intent its snapshot rows serve overflows a column', async () => {
    const snapshotRows = MODEL_INDEX_SNAPSHOT.filter(
      (row) => row.provider === 'anthropic' && row.family !== CLAUDE.family
    );
    const overflowing = {
      ...CLAUDE,
      name: 'x'.repeat(AI_MODEL_INDEX_MAX_LENGTHS.name + 1),
    };
    const { writer, repo } = make(
      LISTED_ROWS.filter((row) => row.provider !== 'anthropic')
    );

    const result = await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({
        models: [...snapshotRows, overflowing, GPT, GEMINI],
      })
    );

    expect(upsertedIds(repo).some((id) => id.startsWith('anthropic:'))).toBe(
      false
    );
    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'floor', models: [CLAUDE_ROUTE_KEY] },
    ]);
  });

  it('should write nothing when the listed rows cannot be read', async () => {
    const { writer, repo } = make();
    repo.listListed.mockRejectedValue(new Error('db down'));

    await expect(
      writer.write(openRouterCatalog(), modelsDevCatalog())
    ).rejects.toThrow('db down');
    expect(repo.upsertMany).not.toHaveBeenCalled();
    expect(repo.markAbsent).not.toHaveBeenCalled();
  });

  it('should conclude no absence when the upsert fails', async () => {
    const { writer, repo } = make();
    repo.upsertMany.mockRejectedValue(new Error('value too long'));

    await expect(
      writer.write(openRouterCatalog(), modelsDevCatalog())
    ).rejects.toThrow('value too long');
    expect(repo.markAbsent).not.toHaveBeenCalled();
  });
});
