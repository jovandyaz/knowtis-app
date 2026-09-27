import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AI_ACTION } from '@knowtis/shared-types';

import type { UsageEstimate } from '../../../ai/application/services/ai-rate-limit.service';
import type { AiExecutionContext } from '../../../ai/domain/execution-context/ai-execution-context';
import { createExecutionContext } from '../../../ai/testing/create-execution-context';
import { AIGenerationPipeline } from './ai-generation.pipeline';

function allowing() {
  return vi.fn(
    async (_execution: AiExecutionContext, estimate: UsageEstimate) => ({
      allowed: true,
      reservation: { estimate },
    })
  );
}

interface PipelineOverrides {
  checkLimit?: ReturnType<typeof vi.fn>;
  selectModel?: ReturnType<typeof vi.fn>;
  generateStructuredOutput?: ReturnType<typeof vi.fn>;
  getPricing?: ReturnType<typeof vi.fn>;
}

function makePipeline(overrides: PipelineOverrides = {}) {
  const checkLimit = overrides.checkLimit ?? allowing();
  const releaseReservation = vi.fn().mockResolvedValue(undefined);
  const recordUsage = vi.fn().mockResolvedValue(undefined);
  const rateLimit = { checkLimit, recordUsage, releaseReservation };
  const orchestrator = {
    selectModel:
      overrides.selectModel ??
      vi.fn().mockResolvedValue({
        isErr: () => false,
        value: { toPrimitive: () => 'anthropic:claude-sonnet-4-20250514' },
      }),
    getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  };
  const structuredOutput = {
    generateStructuredOutput:
      overrides.generateStructuredOutput ??
      vi.fn().mockRejectedValue(new Error('boom')),
  };
  const catalog = {
    getPricing: overrides.getPricing ?? vi.fn().mockReturnValue(undefined),
  };
  const pipeline = new AIGenerationPipeline(
    structuredOutput as never,
    orchestrator as never,
    rateLimit as never,
    catalog as never
  );
  return {
    pipeline,
    checkLimit,
    recordUsage,
    releaseReservation,
    generateStructuredOutput: structuredOutput.generateStructuredOutput,
  };
}

const request = {
  execution: createExecutionContext({ userId: 'user-1' }),
  action: AI_ACTION.SUMMARIZE,
  prompt: 'generate something',
  schema: z.object({ title: z.string() }),
  estimatedTokens: 500,
};

describe('AIGenerationPipeline', () => {
  it('releases the reservation when structured generation fails', async () => {
    const { pipeline, releaseReservation } = makePipeline();

    const result = await pipeline.execute(request);

    expect(result.isErr()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledWith(request.execution, {
      estimate: { tokens: 500, costUsd: 0 },
    });
  });

  it('does not answer a failed generation until the reservation is released', async () => {
    const { pipeline, releaseReservation } = makePipeline();
    const release = Promise.withResolvers<undefined>();
    releaseReservation.mockReturnValue(release.promise);
    let settled = false;

    const pending = pipeline.execute(request).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    release.resolve(undefined);
    expect((await pending).isErr()).toBe(true);
  });

  it('surfaces model-selection errors without consuming the rate limit', async () => {
    const { pipeline, checkLimit } = makePipeline({
      selectModel: vi.fn().mockResolvedValue({
        isErr: () => true,
        error: { message: 'no model available' },
      }),
    });

    const result = await pipeline.execute(request);

    expect(result.isErr()).toBe(true);
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it('passes the estimated cost of the selected model to the rate-limit check', async () => {
    const { pipeline, checkLimit } = makePipeline({
      getPricing: vi.fn().mockReturnValue({ inputCostPerToken: 0.000003 }),
    });

    await pipeline.execute(request);

    expect(checkLimit).toHaveBeenCalledTimes(1);
    const [execution, estimate] = checkLimit.mock.calls[0];
    expect(execution).toBe(request.execution);
    expect(estimate.tokens).toBe(500);
    expect(estimate.costUsd).toBeCloseTo(500 * 0.000003, 12);
  });

  it('releases the reserved cost when generation fails after a costed reserve', async () => {
    const { pipeline, releaseReservation } = makePipeline({
      getPricing: vi.fn().mockReturnValue({ inputCostPerToken: 0.000003 }),
    });

    const result = await pipeline.execute(request);

    expect(result.isErr()).toBe(true);
    const [, released] = releaseReservation.mock.calls[0];
    expect(released.estimate.costUsd).toBeCloseTo(500 * 0.000003, 12);
  });

  it('does not release a reservation when the rate-limit check itself fails', async () => {
    const { pipeline, releaseReservation, generateStructuredOutput } =
      makePipeline({
        checkLimit: vi.fn().mockRejectedValue(new Error('redis exploded')),
      });

    await expect(pipeline.execute(request)).rejects.toThrow('redis exploded');
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('reserves the anonymous share and the IP subject for an anonymous caller', async () => {
    const { pipeline, checkLimit } = makePipeline();
    const execution = createExecutionContext({
      tier: 'anonymous',
      clientIp: '203.0.113.9',
    });
    await pipeline.execute({ ...request, execution });
    expect(checkLimit).toHaveBeenCalledWith(execution, {
      tokens: request.estimatedTokens,
      costUsd: expect.any(Number),
    });
  });

  it('releases exactly the reservation it was given when generation fails', async () => {
    const reservation = {
      estimate: { tokens: 10, costUsd: 0.01 },
      reservedIpSubject: 'ip:abc',
    };
    const { pipeline, releaseReservation } = makePipeline({
      checkLimit: vi.fn().mockResolvedValue({ allowed: true, reservation }),
      generateStructuredOutput: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const execution = createExecutionContext({
      tier: 'anonymous',
      clientIp: '203.0.113.9',
    });
    await pipeline.execute({ ...request, execution });
    expect(releaseReservation).toHaveBeenCalledWith(execution, reservation);
  });

  it('reconciles the same reservation on success', async () => {
    const reservation = {
      estimate: { tokens: 10, costUsd: 0.01 },
      reservedIpSubject: 'ip:abc',
    };
    const { pipeline, recordUsage } = makePipeline({
      checkLimit: vi.fn().mockResolvedValue({ allowed: true, reservation }),
      generateStructuredOutput: vi.fn().mockResolvedValue({
        object: { title: 'Summary' },
        inputTokens: 40,
        outputTokens: 20,
        model: 'anthropic:claude-sonnet-4-20250514',
      }),
    });
    const execution = createExecutionContext({
      tier: 'anonymous',
      clientIp: '203.0.113.9',
    });
    await pipeline.execute({ ...request, execution });
    expect(recordUsage).toHaveBeenCalledWith(
      execution,
      reservation,
      expect.objectContaining({ action: request.action })
    );
  });
});
