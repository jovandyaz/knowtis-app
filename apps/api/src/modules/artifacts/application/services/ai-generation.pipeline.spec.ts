import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AI_ACTION } from '@knowtis/shared-types';

import { AIGenerationPipeline } from './ai-generation.pipeline';

describe('AIGenerationPipeline', () => {
  it('releases the reservation when structured generation fails', async () => {
    const releaseReservation = vi.fn().mockResolvedValue(undefined);
    const rateLimit = {
      checkLimit: vi.fn().mockResolvedValue({ allowed: true }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      releaseReservation,
    };
    const orchestrator = {
      selectModel: vi.fn().mockResolvedValue({
        isErr: () => false,
        value: { toPrimitive: () => 'anthropic:claude-sonnet-4-20250514' },
      }),
      getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
    };
    const structuredOutput = {
      generateStructuredOutput: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const catalog = { getPricing: vi.fn().mockReturnValue(undefined) };
    const config = { get: vi.fn().mockReturnValue('test') };

    const pipeline = new AIGenerationPipeline(
      structuredOutput as never,
      orchestrator as never,
      rateLimit as never,
      catalog as never,
      config as never
    );

    const result = await pipeline.execute({
      userId: 'user-1',
      action: AI_ACTION.SUMMARIZE,
      prompt: 'generate something',
      schema: z.object({ title: z.string() }),
      estimatedTokens: 500,
    });

    expect(result.isErr()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledWith('user-1', 500);
  });

  it('does not release a reservation when the rate-limit check itself fails', async () => {
    const releaseReservation = vi.fn().mockResolvedValue(undefined);
    const rateLimit = {
      checkLimit: vi.fn().mockRejectedValue(new Error('redis exploded')),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      releaseReservation,
    };
    const orchestrator = {
      selectModel: vi.fn(),
      getSystemPrompt: vi.fn(),
    };
    const structuredOutput = { generateStructuredOutput: vi.fn() };
    const catalog = { getPricing: vi.fn().mockReturnValue(undefined) };
    const config = { get: vi.fn().mockReturnValue('test') };

    const pipeline = new AIGenerationPipeline(
      structuredOutput as never,
      orchestrator as never,
      rateLimit as never,
      catalog as never,
      config as never
    );

    await expect(
      pipeline.execute({
        userId: 'user-1',
        action: AI_ACTION.SUMMARIZE,
        prompt: 'generate something',
        schema: z.object({ title: z.string() }),
        estimatedTokens: 500,
      })
    ).rejects.toThrow('redis exploded');
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(structuredOutput.generateStructuredOutput).not.toHaveBeenCalled();
  });
});
