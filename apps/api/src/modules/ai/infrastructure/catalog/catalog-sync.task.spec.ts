import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdvisoryLockClient } from '../../../../test-support/advisory-lock';
import { openTierSlug } from '../../domain/model-catalog/curated-watch';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import type { ModelsDevCatalog } from '../../domain/ports/models-dev.port';
import type {
  UpstreamCatalog,
  UpstreamModel,
} from '../../domain/ports/openrouter-models.port';
import { CatalogSyncTask } from './catalog-sync.task';
import type { ModelIndexWriter } from './model-index.writer';

const GLM_CURATED_ID = 'openrouter:z-ai/glm-5.2';
const GLM_SLUG = 'z-ai/glm-5.2';
const GLM_OUTPUT_COST = 0.0000044;
const REPRICE_FACTOR = 2;
const PROMOTED_SLUG = 'qwen/qwen3-max';
const PROMOTED_ID = `openrouter:${PROMOTED_SLUG}`;
const EXPIRATION_DATE = new Date('2026-12-31T00:00:00.000Z');

function upstreamModel(
  id: string,
  overrides: Partial<UpstreamModel> = {}
): UpstreamModel {
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
    intelligenceIndex: 58.1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    reasoning: null,
    ...overrides,
  };
}

const MODELS_DEV_CATALOG: ModelsDevCatalog = {
  models: [],
  openRouterEnrichment: new Map(),
  discarded: [],
};
const INDEXED_ROWS = 640;

const QWEN_CANDIDATE = upstreamModel('qwen/qwen3.8-max');
const DEEPSEEK_CANDIDATE = upstreamModel('deepseek/deepseek-v4-flash');
const CLOSED_WEIGHT_MODEL = upstreamModel('openai/gpt-5.4');

const CURATED_OPEN_SLUGS = CURATED_MODELS.map((model) =>
  openTierSlug(model.id)
).filter((slug): slug is string => slug !== null);

/** Curated open-tier models present and undated, so they raise nothing: a fixture that omits one asserts it vanished upstream. */
function withCuratedInSync(...models: UpstreamModel[]): UpstreamCatalog {
  const provided = new Set(models.map((model) => model.id));
  return {
    models: [
      ...CURATED_OPEN_SLUGS.filter((slug) => !provided.has(slug)).map((slug) =>
        upstreamModel(slug)
      ),
      ...models,
    ],
    complete: true,
    discarded: [],
  };
}

function make(
  options: {
    upstream?: UpstreamModel[];
    locked?: boolean;
    promoted?: string[];
  } = {}
) {
  const lock = createAdvisoryLockClient(options.locked ?? true);
  const repo = {
    upsertCandidate: vi.fn().mockResolvedValue(undefined),
    createAlert: vi.fn().mockResolvedValue(undefined),
    listByStatus: vi
      .fn()
      .mockResolvedValue((options.promoted ?? []).map((id) => ({ id }))),
  };
  const openRouter = {
    fetchModels: vi
      .fn()
      .mockResolvedValue(withCuratedInSync(...(options.upstream ?? []))),
  };
  const modelsDev = {
    fetchCatalog: vi.fn().mockResolvedValue(MODELS_DEV_CATALOG),
  };
  const indexWriter = {
    write: vi.fn<ModelIndexWriter['write']>().mockResolvedValue({
      indexed: INDEXED_ROWS,
      absent: 0,
      rejected: [],
    }),
  };
  const task = new CatalogSyncTask(
    lock.client,
    repo as never,
    openRouter as never,
    modelsDev as never,
    indexWriter as never
  );
  return {
    task,
    lock,
    repo,
    openRouter,
    modelsDev,
    indexWriter,
  };
}

describe('CatalogSyncTask', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  let warnLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnLog = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should store every upstream model that passes the candidate filter', async () => {
    const { task, repo } = make({
      upstream: [QWEN_CANDIDATE, DEEPSEEK_CANDIDATE],
    });

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledTimes(2);
    expect(repo.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'openrouter:qwen/qwen3.8-max',
        label: 'qwen/qwen3.8-max',
        maxInputTokens: 262_144,
        outputCostPerToken: 0.000006,
      })
    );
  });

  it('should skip an upstream model the candidate filter rejects', async () => {
    const { task, repo } = make({
      upstream: [CLOSED_WEIGHT_MODEL, QWEN_CANDIDATE],
    });

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledTimes(1);
    expect(repo.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'openrouter:qwen/qwen3.8-max' })
    );
  });

  it('should persist declared reasoning support on the candidate', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel('qwen/qwen3.8-max', {
          reasoning: { levels: ['low', 'high'], mandatory: true },
        }),
      ],
    });

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { levels: ['low', 'high'], mandatory: true },
      })
    );
  });

  it('should persist a reasoning model that enumerates no efforts', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel('qwen/qwen3.8-max', {
          reasoning: { levels: [], mandatory: true },
        }),
      ],
    });

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: { levels: [], mandatory: true } })
    );
  });

  it('should raise a deprecation alert when OpenRouter dates a curated model', async () => {
    const { task, repo } = make({
      upstream: [upstreamModel(GLM_SLUG, { expirationDate: EXPIRATION_DATE })],
    });

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledWith(
      GLM_CURATED_ID,
      'deprecation',
      expect.stringContaining('2026-12-31')
    );
  });

  it('should raise an unavailable alert when a curated model leaves OpenRouter', async () => {
    const { task, repo, openRouter } = make();
    const inSync = withCuratedInSync();
    openRouter.fetchModels.mockResolvedValue({
      ...inSync,
      models: inSync.models.filter((model) => model.id !== GLM_SLUG),
    });

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledWith(
      GLM_CURATED_ID,
      'unavailable',
      expect.stringContaining(GLM_SLUG)
    );
  });

  it('should raise no unavailable alert when the fetch stopped paginating early', async () => {
    const { task, repo, openRouter } = make();
    const inSync = withCuratedInSync();
    openRouter.fetchModels.mockResolvedValue({
      ...inSync,
      models: inSync.models.filter((model) => model.id !== GLM_SLUG),
      complete: false,
    });

    await task.sync();

    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should raise no alert when OpenRouter reprices a curated model', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel(GLM_SLUG, {
          completionCostPerToken: GLM_OUTPUT_COST * REPRICE_FACTOR,
        }),
      ],
    });

    await task.sync();

    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should write nothing while another run holds the lock', async () => {
    const { task, repo } = make({
      upstream: [QWEN_CANDIDATE],
      locked: false,
    });

    await task.sync();

    expect(repo.upsertCandidate).not.toHaveBeenCalled();
    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  // The lock has to bracket the fetches, not just the writes: two runs that
  // both call OpenRouter and models.dev before either takes the lock waste four
  // upstream calls and make the reported "skipped" outcome a lie.
  it('should never call upstream when another run holds the lock', async () => {
    const { task, openRouter, modelsDev, indexWriter } = make({
      upstream: [QWEN_CANDIDATE],
      locked: false,
    });

    await task.sync();

    expect(openRouter.fetchModels).not.toHaveBeenCalled();
    expect(modelsDev.fetchCatalog).not.toHaveBeenCalled();
    expect(indexWriter.write).not.toHaveBeenCalled();
  });

  it('should unlock and free the reserved connection after a pass', async () => {
    const { task, lock } = make({ upstream: [QWEN_CANDIDATE] });

    await task.sync();

    expect(lock.queries[0]).toContain('pg_try_advisory_lock');
    expect(lock.queries[1]).toContain('pg_advisory_unlock');
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('should log and swallow a failing upstream fetch', async () => {
    const { task, openRouter } = make();
    openRouter.fetchModels.mockRejectedValue(new Error('openrouter down'));

    await expect(task.sync()).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.sync_failed',
        reason: 'openrouter down',
        stack: expect.stringContaining('openrouter down'),
      })
    );
  });

  it('should keep syncing the other models when one upsert fails', async () => {
    const { task, repo } = make({
      upstream: [QWEN_CANDIDATE, DEEPSEEK_CANDIDATE],
    });
    repo.upsertCandidate.mockRejectedValueOnce(new Error('value too long'));

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledTimes(2);
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.sync_write_failed',
        count: 1,
      })
    );
  });

  it('should keep raising the other alerts when one alert write fails', async () => {
    const { task, repo } = make({
      upstream: [upstreamModel(GLM_SLUG, { expirationDate: EXPIRATION_DATE })],
      promoted: [PROMOTED_ID],
    });
    repo.createAlert.mockRejectedValueOnce(new Error('alerts table locked'));

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledTimes(2);
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.sync_write_failed',
        count: 1,
        failures: [
          {
            target: `${GLM_CURATED_ID} deprecation`,
            reason: 'alerts table locked',
          },
        ],
      })
    );
  });
  it('should report what an on-demand run wrote', async () => {
    const { task } = make({
      upstream: [QWEN_CANDIDATE, DEEPSEEK_CANDIDATE, CLOSED_WEIGHT_MODEL],
    });

    await expect(task.run()).resolves.toEqual({
      status: 'completed',
      skippedReason: null,
      upstream: 3 + CURATED_OPEN_SLUGS.length,
      candidates: 2,
      indexed: INDEXED_ROWS,
      alerts: 0,
      failures: 0,
    });
  });

  it('should count the writes that failed rather than hide them behind a success', async () => {
    const { task, repo } = make({
      upstream: [QWEN_CANDIDATE, DEEPSEEK_CANDIDATE],
    });
    repo.upsertCandidate.mockRejectedValueOnce(new Error('value too long'));

    await expect(task.run()).resolves.toEqual({
      status: 'completed',
      skippedReason: null,
      upstream: 2 + CURATED_OPEN_SLUGS.length,
      candidates: 1,
      indexed: INDEXED_ROWS,
      alerts: 0,
      failures: 1,
    });
  });

  it('should tell an on-demand run another holder has the lock', async () => {
    const { task } = make({ upstream: [QWEN_CANDIDATE], locked: false });

    await expect(task.run()).resolves.toEqual({
      status: 'skipped',
      skippedReason: 'locked',
      upstream: 0,
      candidates: 0,
      indexed: 0,
      alerts: 0,
      failures: 0,
    });
  });

  it('should alert when a promoted model is gone from a complete catalog', async () => {
    const { task, repo } = make({ promoted: [PROMOTED_ID] });

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledWith(
      PROMOTED_ID,
      'unavailable',
      expect.stringContaining(PROMOTED_SLUG)
    );
  });

  it('should stay quiet on a promoted model upstream still lists', async () => {
    const { task, repo } = make({
      promoted: [PROMOTED_ID],
      upstream: [upstreamModel(PROMOTED_SLUG)],
    });

    await task.sync();

    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should keep syncing candidates when the promoted read fails', async () => {
    const { task, repo } = make({
      promoted: [PROMOTED_ID],
      upstream: [QWEN_CANDIDATE],
    });
    repo.listByStatus.mockRejectedValue(new Error('catalog table locked'));

    const result = await task.run();

    expect(result.status).toBe('completed');
    expect(repo.upsertCandidate).toHaveBeenCalled();
    expect(repo.createAlert).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.promoted_read_failed' })
    );
  });

  it('should warn that the vanish watch is blind on an inconclusive read', async () => {
    const { task, openRouter } = make();
    const inSync = withCuratedInSync();
    openRouter.fetchModels.mockResolvedValue({ ...inSync, complete: false });

    await task.sync();

    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.catalog.absence_watch_blind',
        complete: false,
      })
    );
  });

  it('should not warn about the vanish watch on a conclusive read', async () => {
    const { task } = make();

    await task.sync();

    expect(warnLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.absence_watch_blind' })
    );
  });

  it('should reject an on-demand run when the upstream fetch fails', async () => {
    const { task, openRouter } = make();
    openRouter.fetchModels.mockRejectedValue(new Error('openrouter down'));

    await expect(task.run()).rejects.toThrow('openrouter down');
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('should index the OpenRouter read together with the models.dev read', async () => {
    const { task, openRouter, indexWriter } = make({
      upstream: [QWEN_CANDIDATE],
    });

    await task.run();

    const openRouterRead = await openRouter.fetchModels.mock.results[0]?.value;
    expect(indexWriter.write).toHaveBeenCalledWith(
      openRouterRead,
      MODELS_DEV_CATALOG
    );
  });

  it('should index OpenRouter alone and still complete when the models.dev fetch fails', async () => {
    const { task, repo, modelsDev, indexWriter } = make({
      upstream: [QWEN_CANDIDATE],
    });
    modelsDev.fetchCatalog.mockRejectedValue(new Error('models.dev down'));

    const result = await task.run();

    expect(indexWriter.write).toHaveBeenCalledWith(expect.anything(), null);
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        candidates: 1,
        indexed: INDEXED_ROWS,
      })
    );
    expect(repo.upsertCandidate).toHaveBeenCalledTimes(1);
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.model_index.models_dev_fetch_failed',
        reason: 'models.dev down',
      })
    );
  });

  it('should report nothing indexed but still sync candidates and alerts when the index write fails', async () => {
    const { task, repo, indexWriter } = make({
      upstream: [
        QWEN_CANDIDATE,
        upstreamModel(GLM_SLUG, { expirationDate: EXPIRATION_DATE }),
      ],
    });
    indexWriter.write.mockRejectedValue(new Error('model index locked'));

    const result = await task.run();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        candidates: 1,
        indexed: 0,
        alerts: 1,
      })
    );
    expect(repo.createAlert).toHaveBeenCalledWith(
      GLM_CURATED_ID,
      'deprecation',
      expect.any(String)
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.model_index.write_failed',
        reason: 'model index locked',
      })
    );
  });

  it('should release the lock when the upstream fetch fails inside it', async () => {
    const { task, openRouter, lock } = make();
    openRouter.fetchModels.mockRejectedValue(new Error('openrouter down'));

    await task.sync();

    expect(lock.queries.at(-1)).toContain('pg_advisory_unlock');
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
