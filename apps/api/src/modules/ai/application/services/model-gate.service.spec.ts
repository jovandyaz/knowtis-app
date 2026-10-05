import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  PLATFORM_SEED_MODELS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import {
  createModelResolutionRepositoryStub,
  createResolutionsStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import type { AIConfigService } from './ai-config.service';
import { ModelGateService } from './model-gate.service';

const CANDIDATE = 'openrouter:deepseek/deepseek-v4.1-flash';
const NEWER_CANDIDATE = 'openrouter:z-ai/glm-5.3';
const FAILED_CANDIDATE = 'openrouter:deepseek/deepseek-v4-pro-0813';
const RUN_URL = 'https://github.com/jovandyaz/knowtis-app/actions/runs/1';
const VERDICT_DETAIL = 'leaked a secret';
const SERVED = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v4-pro-0813',
  powerful: 'openrouter:qwen/qwen3.8-max-0902',
} as const satisfies Record<ModelIntent, string>;
const FAST_PENDING = seededResolution('fast', {
  pendingModelId: CANDIDATE,
  gateStatus: 'pending',
});

function make(
  rows: readonly ModelResolution[] = [FAST_PENDING],
  servedBy: ModelIntent | null = null
) {
  const repo = createModelResolutionRepositoryStub(async () => [...rows]);
  const resolutions = createResolutionsStub(rows);
  const refresh = vi.spyOn(resolutions, 'refresh');
  const config = {
    getIntentModels: vi
      .fn<AIConfigService['getIntentModels']>()
      .mockResolvedValue(SERVED),
    intentServing: vi
      .fn<AIConfigService['intentServing']>()
      .mockResolvedValue(servedBy),
  } satisfies Pick<AIConfigService, 'getIntentModels' | 'intentServing'>;
  const service = new ModelGateService(repo, resolutions, config as never);
  return { service, repo, refresh, config };
}

describe('ModelGateService', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists only models whose gate is pending', async () => {
    const { service } = make([
      FAST_PENDING,
      seededResolution('balanced', {
        pendingModelId: FAILED_CANDIDATE,
        gateStatus: 'failed',
        gateDetail: VERDICT_DETAIL,
      }),
      seededResolution('powerful'),
    ]);

    expect(await service.pending()).toEqual([
      { selectorKey: 'platform.fast', modelId: CANDIDATE },
    ]);
  });

  it('returns the model each intent serves', async () => {
    const { service } = make();

    expect(await service.active()).toEqual(SERVED);
  });

  it('activates a passed model, refreshes the resolutions and logs ai.model.resolution_activated', async () => {
    const { service, repo, refresh } = make();

    const outcome = await service.verdict({
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      passed: true,
      runUrl: RUN_URL,
    });

    expect(outcome).toEqual({ applied: true });
    expect(repo.recordVerdict).toHaveBeenCalledWith(
      'platform.fast',
      CANDIDATE,
      { passed: true, runUrl: RUN_URL },
      SNAPSHOT_DATE
    );
    expect(Math.max(...refresh.mock.invocationCallOrder)).toBeGreaterThan(
      vi.mocked(repo.recordVerdict).mock.invocationCallOrder[0]
    );
    expect(log).toHaveBeenCalledWith({
      event: 'ai.model.resolution_activated',
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      previousModelId: PLATFORM_SEED_MODELS.fast,
    });
  });

  it("records a failed verdict with its detail, defaulting to 'eval gate failed'", async () => {
    const { service, repo, config } = make();
    const tooLong = 'x'.repeat(AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH + 1);

    for (const detail of [VERDICT_DETAIL, undefined, '  ', tooLong]) {
      expect(
        await service.verdict({
          selectorKey: 'platform.fast',
          modelId: CANDIDATE,
          passed: false,
          runUrl: RUN_URL,
          ...(detail === undefined ? {} : { detail }),
        })
      ).toEqual({ applied: true });
    }

    expect(
      vi.mocked(repo.recordVerdict).mock.calls.map(([, , verdict]) => verdict)
    ).toEqual([
      { passed: false, runUrl: RUN_URL, detail: VERDICT_DETAIL },
      { passed: false, runUrl: RUN_URL, detail: 'eval gate failed' },
      { passed: false, runUrl: RUN_URL, detail: 'eval gate failed' },
      {
        passed: false,
        runUrl: RUN_URL,
        detail: 'x'.repeat(AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH),
      },
    ]);
    expect(config.intentServing).not.toHaveBeenCalled();
  });

  it('does not activate a model another intent serves', async () => {
    const { service, repo, config } = make([FAST_PENDING], 'balanced');

    const outcome = await service.verdict({
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      passed: true,
      runUrl: RUN_URL,
    });

    expect(outcome).toEqual({ applied: false, reason: 'conflict' });
    expect(config.intentServing).toHaveBeenCalledWith(CANDIDATE, 'fast');
    expect(repo.recordVerdict).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({
      event: 'ai.model_resolution.activation_conflict',
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      servedBy: 'balanced',
    });
  });

  it('checks the clash against resolutions refreshed from the store', async () => {
    const { service, refresh, config } = make([FAST_PENDING], 'balanced');

    await service.verdict({
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      passed: true,
      runUrl: RUN_URL,
    });

    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      config.intentServing.mock.invocationCallOrder[0]
    );
  });

  it('reports a verdict for a model no longer pending as not_pending', async () => {
    const { service, repo, config } = make(
      [
        seededResolution('fast', {
          pendingModelId: NEWER_CANDIDATE,
          gateStatus: 'pending',
        }),
      ],
      'balanced'
    );
    vi.mocked(repo.recordVerdict).mockResolvedValue(false);

    for (const passed of [true, false]) {
      expect(
        await service.verdict({
          selectorKey: 'platform.fast',
          modelId: CANDIDATE,
          passed,
          runUrl: RUN_URL,
        })
      ).toEqual({ applied: false, reason: 'not_pending' });
    }
    expect(config.intentServing).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports not_pending for a passed verdict on a gate that already failed, even when its model would clash', async () => {
    const { service, repo } = make(
      [
        seededResolution('fast', {
          pendingModelId: CANDIDATE,
          gateStatus: 'failed',
          gateDetail: VERDICT_DETAIL,
        }),
      ],
      'balanced'
    );

    const outcome = await service.verdict({
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      passed: true,
      runUrl: RUN_URL,
    });

    expect(outcome).toEqual({ applied: false, reason: 'not_pending' });
    expect(repo.recordVerdict).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs no activation when the write finds the model no longer pending', async () => {
    const { service, repo } = make();
    vi.mocked(repo.recordVerdict).mockResolvedValue(false);

    const outcome = await service.verdict({
      selectorKey: 'platform.fast',
      modelId: CANDIDATE,
      passed: true,
      runUrl: RUN_URL,
    });

    expect(outcome).toEqual({ applied: false, reason: 'not_pending' });
    expect(log).not.toHaveBeenCalled();
  });
});
