import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import type { UpstreamModel } from '../../domain/ports/openrouter-models.port';
import { CatalogSyncTask } from './catalog-sync.task';

const GLM_CURATED_ID = 'openrouter:z-ai/glm-5.2';
const GLM_SLUG = 'z-ai/glm-5.2';
const GLM_VENDORED_OUTPUT_COST = 0.0000044;
const SONNET_CURATED_ID = 'anthropic:claude-sonnet-5';
const SONNET_LITELLM_KEY = 'claude-sonnet-5';
const SONNET_VENDORED_OUTPUT_COST = 0.00001;

const VENDORED_PRICING: Record<string, { outputCostPerToken: number }> = {
  [GLM_CURATED_ID]: { outputCostPerToken: GLM_VENDORED_OUTPUT_COST },
  [SONNET_CURATED_ID]: { outputCostPerToken: SONNET_VENDORED_OUTPUT_COST },
};

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
    expirationDate: null,
    intelligenceIndex: 58.1,
    outputModalities: ['text'],
    ...overrides,
  };
}

const QWEN_CANDIDATE = upstreamModel('qwen/qwen3.8-max');
const DEEPSEEK_CANDIDATE = upstreamModel('deepseek/deepseek-v4-flash');
const CLOSED_WEIGHT_MODEL = upstreamModel('openai/gpt-5.4');

function make(
  options: {
    upstream?: UpstreamModel[];
    liteLlmPrices?: Record<
      string,
      { output_cost_per_token?: number; deprecation_date?: string }
    >;
    locked?: boolean;
    flagEnabled?: boolean;
  } = {}
) {
  const tx = {
    execute: vi.fn().mockResolvedValue([{ locked: options.locked ?? true }]),
  };
  const db = {
    transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) =>
      work(tx)
    ),
  };
  const flags = {
    isEnabled: vi.fn().mockResolvedValue(options.flagEnabled ?? true),
  };
  const repo = {
    upsertCandidate: vi.fn().mockResolvedValue(undefined),
    createAlert: vi.fn().mockResolvedValue(undefined),
  };
  const openRouter = {
    fetchModels: vi.fn().mockResolvedValue(options.upstream ?? []),
  };
  const liteLlm = {
    fetchPrices: vi.fn().mockResolvedValue(options.liteLlmPrices ?? {}),
  };
  const catalog = {
    getPricing: vi.fn((modelId: string) => VENDORED_PRICING[modelId]),
  };
  const task = new CatalogSyncTask(
    db as never,
    flags as never,
    repo as never,
    openRouter as never,
    liteLlm as never,
    catalog as never
  );
  return { task, db, tx, flags, repo, openRouter, liteLlm, catalog };
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

  it('should gate the run on the registered ai_catalog_sync flag key', async () => {
    expect(FEATURE_FLAG_KEYS.AI_CATALOG_SYNC).toBe('ai_catalog_sync');
    const { task, flags } = make();

    await task.sync();

    expect(flags.isEnabled).toHaveBeenCalledWith(
      FEATURE_FLAG_KEYS.AI_CATALOG_SYNC
    );
  });

  it('should touch nothing while the flag is off', async () => {
    const { task, openRouter, liteLlm, db } = make({
      flagEnabled: false,
      upstream: [QWEN_CANDIDATE],
    });

    await task.sync();

    expect(openRouter.fetchModels).not.toHaveBeenCalled();
    expect(liteLlm.fetchPrices).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
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

  it('should raise a deprecation alert when OpenRouter dates a curated model', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel(GLM_SLUG, {
          completionCostPerToken: GLM_VENDORED_OUTPUT_COST,
          expirationDate: new Date('2026-12-31T00:00:00.000Z'),
        }),
      ],
    });

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledWith(
      GLM_CURATED_ID,
      'deprecation',
      expect.stringContaining('2026-12-31')
    );
  });

  it('should raise a price_drift alert when the vendored cost stops covering OpenRouter', async () => {
    const { task, repo, catalog } = make({
      upstream: [
        upstreamModel(GLM_SLUG, {
          completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 2,
        }),
      ],
    });

    await task.sync();

    expect(catalog.getPricing).toHaveBeenCalledWith(GLM_CURATED_ID);
    expect(repo.createAlert).toHaveBeenCalledWith(
      GLM_CURATED_ID,
      'price_drift',
      expect.stringContaining('$8.80/M')
    );
  });

  it('should stay quiet on a price move the vendored cost still covers', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel(GLM_SLUG, {
          completionCostPerToken: GLM_VENDORED_OUTPUT_COST * 1.1,
        }),
      ],
    });

    await task.sync();

    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should raise a deprecation alert when LiteLLM dates a curated model', async () => {
    const { task, repo } = make({
      liteLlmPrices: {
        [SONNET_LITELLM_KEY]: {
          output_cost_per_token: SONNET_VENDORED_OUTPUT_COST,
          deprecation_date: '2027-01-15',
        },
      },
    });

    await task.sync();

    expect(repo.createAlert).toHaveBeenCalledWith(
      SONNET_CURATED_ID,
      'deprecation',
      expect.stringContaining('2027-01-15')
    );
  });

  it('should stay quiet about a curated model LiteLLM does not publish', async () => {
    const { task, repo } = make({
      upstream: [
        upstreamModel(GLM_SLUG, {
          completionCostPerToken: GLM_VENDORED_OUTPUT_COST,
        }),
      ],
      liteLlmPrices: {},
    });

    await task.sync();

    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should still discover candidates when the LiteLLM fetch fails', async () => {
    const { task, repo, liteLlm } = make({ upstream: [QWEN_CANDIDATE] });
    liteLlm.fetchPrices.mockRejectedValue(new Error('raw.github down'));

    await task.sync();

    expect(repo.upsertCandidate).toHaveBeenCalledTimes(1);
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.catalog.litellm_fetch_failed' })
    );
  });

  it('should write nothing while another run holds the lock', async () => {
    const { task, repo, db } = make({
      upstream: [QWEN_CANDIDATE],
      locked: false,
    });

    await task.sync();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(repo.upsertCandidate).not.toHaveBeenCalled();
    expect(repo.createAlert).not.toHaveBeenCalled();
  });

  it('should hold a transaction-scoped lock that needs no explicit unlock', async () => {
    const { task, tx } = make({ upstream: [QWEN_CANDIDATE] });

    await task.sync();

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.execute.mock.calls[0][0])).toContain(
      'pg_try_advisory_xact_lock'
    );
  });

  it('should log and swallow a failing upstream fetch', async () => {
    const { task, openRouter, db } = make();
    openRouter.fetchModels.mockRejectedValue(new Error('openrouter down'));

    await expect(task.sync()).resolves.toBeUndefined();

    expect(db.transaction).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Catalog sync failed',
      expect.stringContaining('openrouter down')
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
});
