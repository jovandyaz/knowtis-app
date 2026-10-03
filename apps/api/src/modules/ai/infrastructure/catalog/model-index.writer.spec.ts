import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fromOpenRouter,
  INDEX_PROVIDERS,
  MODEL_INDEX_SNAPSHOT,
  type IndexedModel,
  type IndexProvider,
  type ModelsDevEnrichment,
} from '@knowtis/ai-gateway';

import { openTierSlug } from '../../domain/model-catalog/curated-watch';
import { FLOOR_MODEL_IDS } from '../../domain/model-catalog/floor-models';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
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
import { ModelIndexWriter } from './model-index.writer';

const QWEN_SLUG = 'qwen/qwen3.8-max';
const DEEPSEEK_SLUG = 'deepseek/deepseek-v4-flash';
const DISCARDED_SLUG = 'z-ai/glm-5.2-air';

// OpenRouter only proves absence while it still lists a curated open-tier model.
function curatedOpenSlug(): string {
  for (const model of CURATED_MODELS) {
    const slug = openTierSlug(model.id);
    if (slug !== null) {
      return slug;
    }
  }
  throw new Error('the writer spec needs one curated open-tier model');
}

const CURATED_OPEN_SLUG = curatedOpenSlug();
const CURATED_OPEN_ID = `openrouter:${CURATED_OPEN_SLUG}`;

const NOTHING_LISTED: Readonly<Record<IndexProvider, number>> = {
  anthropic: 0,
  openai: 0,
  google: 0,
  openrouter: 0,
};

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

function openRouterCatalog(
  overrides: Partial<UpstreamCatalog> = {}
): UpstreamCatalog {
  return {
    models: [upstreamModel(CURATED_OPEN_SLUG), upstreamModel(QWEN_SLUG)],
    complete: true,
    discarded: [],
    ...overrides,
  };
}

function directModel(provider: IndexProvider, slug: string): IndexedModel {
  return {
    id: `${provider}:${slug}`,
    provider,
    name: slug,
    family: slug,
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

const CLAUDE = directModel('anthropic', 'claude-sonnet-5');
const GPT = directModel('openai', 'gpt-5.4');
const GEMINI = directModel('google', 'gemini-3-pro');
const CLAUDE_NEXT = directModel('anthropic', 'claude-next');

const LISTED_ROWS: readonly IndexedModel[] = [
  CLAUDE,
  GPT,
  GEMINI,
  ...openRouterCatalog().models.map((model) => fromOpenRouter(model, null)),
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

function make(
  previousListed: Partial<Record<IndexProvider, number>> = {},
  listed: readonly IndexedModel[] = LISTED_ROWS
) {
  const repo = {
    countListedByProvider: vi
      .fn<ModelIndexRepository['countListedByProvider']>()
      .mockResolvedValue({ ...NOTHING_LISTED, ...previousListed }),
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
  return { writer: new ModelIndexWriter(repo), repo };
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
    vi.restoreAllMocks();
  });

  it('should index every provider and conclude absence for each on a clean read', async () => {
    const { writer, repo } = make();

    const result = await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(upsertedIds(repo).sort()).toEqual(
      [
        CLAUDE.id,
        GPT.id,
        GEMINI.id,
        `openrouter:${CURATED_OPEN_SLUG}`,
        `openrouter:${QWEN_SLUG}`,
      ].sort()
    );
    expect(absenceConcludedFor(repo).sort()).toEqual(
      [...INDEX_PROVIDERS].sort()
    );
    expect(result).toEqual({ indexed: 5, absent: 0, rejected: [] });
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

  it('should read the listed counts before it upserts', async () => {
    const { writer, repo } = make();

    await writer.write(openRouterCatalog(), modelsDevCatalog());

    const [countedAt = Infinity] =
      repo.countListedByProvider.mock.invocationCallOrder;
    const [upsertedAt = -Infinity] = repo.upsertMany.mock.invocationCallOrder;
    expect(countedAt).toBeLessThan(upsertedAt);
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
      indexed: 5,
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
    const { writer, repo } = make({ anthropic: 4, openai: 4, google: 4 });

    await writer.write(openRouterCatalog(), null);

    expect(upsertedIds(repo).sort()).toEqual(
      [`openrouter:${CURATED_OPEN_SLUG}`, `openrouter:${QWEN_SLUG}`].sort()
    );
    expect(absenceConcludedFor(repo)).toEqual(['openrouter']);
    expect(warnLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_index.sync_rejected' })
    );
  });

  it('should conclude no absence anywhere when models.dev failed and OpenRouter is inconclusive', async () => {
    const { writer, repo } = make({ openrouter: 2 });

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
          upstreamModel(CURATED_OPEN_SLUG),
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
    const { writer, repo } = make({ anthropic: 1, openai: 1, google: 1 });

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

  it('should keep a model OpenRouter published but discarded from absence', async () => {
    const { writer, repo } = make({ openrouter: 3 });

    await writer.write(
      openRouterCatalog({ discarded: [DISCARDED_SLUG] }),
      modelsDevCatalog()
    );

    expect(absenceConcludedFor(repo)).toContain('openrouter');
    expect(repo.markAbsent).toHaveBeenCalledWith(
      'openrouter',
      expect.any(Date),
      [`openrouter:${DISCARDED_SLUG}`]
    );
  });

  it('should warn with the counts behind a rejection on an inconclusive OpenRouter read', async () => {
    const { writer, repo } = make({ openrouter: 2 });

    await writer.write(
      openRouterCatalog({ discarded: [UNPARSEABLE_MODEL_ID] }),
      modelsDevCatalog()
    );

    expect(absenceConcludedFor(repo)).not.toContain('openrouter');
    expect(warnLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'openrouter',
      reason: 'inconclusive',
      rows: 2,
      previous: 2,
    });
  });

  it('should keep a provider listed whose rows shrank by more than half', async () => {
    const { writer, repo } = make({ anthropic: 3 });

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
    const { writer, repo } = make({ openrouter: 2 });
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
      { provider: 'openrouter', reason: 'floor', models: [CURATED_OPEN_ID] },
    ]);
    expect(errorLog).toHaveBeenCalledWith({
      event: 'ai.model_index.sync_rejected',
      provider: 'openrouter',
      reason: 'floor',
      models: [CURATED_OPEN_ID],
      rows: 2,
      previous: 2,
    });
  });

  it('should write none of a batch that drops a floor model its provider serves', async () => {
    const { writer, repo } = make({ anthropic: 1, openai: 1, google: 1 });

    const result = await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [CLAUDE_NEXT, GPT, GEMINI] })
    );

    expect(upsertedIds(repo)).not.toContain(CLAUDE_NEXT.id);
    expect(absenceConcludedFor(repo)).not.toContain('anthropic');
    expect(result.rejected).toEqual([
      { provider: 'anthropic', reason: 'floor', models: [CLAUDE.id] },
    ]);
  });

  it('should accept a batch that still serves its provider floor models under new facts', async () => {
    const { writer, repo } = make({ openrouter: 2 });
    const repriced = openRouterCatalog().models.map((model) => ({
      ...model,
      promptCostPerToken: model.promptCostPerToken * 2,
      contextLength: model.contextLength / 2,
    }));

    const result = await writer.write(
      openRouterCatalog({ models: repriced }),
      modelsDevCatalog()
    );

    expect(upsertedIds(repo)).toContain(CURATED_OPEN_ID);
    expect(absenceConcludedFor(repo)).toContain('openrouter');
    expect(result.rejected).toEqual([]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('should hold a provider with no listed rows to the floor models its snapshot rows serve', async () => {
    const { writer, repo } = make(
      {},
      LISTED_ROWS.filter((row) => row.provider !== 'anthropic')
    );

    const result = await writer.write(openRouterCatalog(), modelsDevCatalog());

    expect(upsertedIds(repo)).not.toContain(CLAUDE.id);
    expect(absenceConcludedFor(repo)).not.toContain('anthropic');
    expect(result.rejected).toEqual([
      {
        provider: 'anthropic',
        reason: 'floor',
        models: FLOOR_MODEL_IDS.filter(
          (id) => id.startsWith('anthropic:') && id !== CLAUDE.id
        ),
      },
    ]);
  });

  it('should accept a provider with no listed rows whose batch serves what its snapshot rows serve', async () => {
    const snapshotRows = MODEL_INDEX_SNAPSHOT.filter(
      (row) => row.provider === 'anthropic'
    );
    const { writer, repo } = make(
      {},
      LISTED_ROWS.filter((row) => row.provider !== 'anthropic')
    );

    const result = await writer.write(
      openRouterCatalog(),
      modelsDevCatalog({ models: [...snapshotRows, GPT, GEMINI] })
    );

    expect(upsertedIds(repo)).toEqual(
      expect.arrayContaining(snapshotRows.map((row) => row.id))
    );
    expect(absenceConcludedFor(repo)).toContain('anthropic');
    expect(result.rejected).toEqual([]);
  });

  it('should write nothing when the listed counts cannot be read', async () => {
    const { writer, repo } = make();
    repo.countListedByProvider.mockRejectedValue(new Error('db down'));

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
