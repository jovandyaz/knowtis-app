import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AI_ACTION } from '@knowtis/shared-types';

import { AIGenerationPipeline } from './ai-generation.pipeline';

interface PipelineOverrides {
  checkLimit?: ReturnType<typeof vi.fn>;
  selectModel?: ReturnType<typeof vi.fn>;
  generateStructuredOutput?: ReturnType<typeof vi.fn>;
  getPricing?: ReturnType<typeof vi.fn>;
}

function makePipeline(overrides: PipelineOverrides = {}) {
  const checkLimit =
    overrides.checkLimit ?? vi.fn().mockResolvedValue({ allowed: true });
  const releaseReservation = vi.fn().mockResolvedValue(undefined);
  const rateLimit = {
    checkLimit,
    recordUsage: vi.fn().mockResolvedValue(undefined),
    releaseReservation,
  };
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
    releaseReservation,
    generateStructuredOutput: structuredOutput.generateStructuredOutput,
  };
}

const request = {
  userId: 'user-1',
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
    expect(releaseReservation).toHaveBeenCalledWith('user-1', 500, 0);
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
    const [userId, estimatedTokens, , , estimatedCostUsd] =
      checkLimit.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(estimatedTokens).toBe(500);
    expect(estimatedCostUsd).toBeCloseTo(500 * 0.000003, 12);
  });

  it('releases the reserved cost when generation fails after a costed reserve', async () => {
    const { pipeline, releaseReservation } = makePipeline({
      getPricing: vi.fn().mockReturnValue({ inputCostPerToken: 0.000003 }),
    });

    const result = await pipeline.execute(request);

    expect(result.isErr()).toBe(true);
    const [, , releasedCost] = releaseReservation.mock.calls[0];
    expect(releasedCost).toBeCloseTo(500 * 0.000003, 12);
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
});
