import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { AIErrorCodes } from '../../domain/errors/ai.errors';
import { VoiceNoteHandler } from './voice-note.handler';

interface HandlerOverrides {
  transcribe?: ReturnType<typeof vi.fn>;
  selectModel?: ReturnType<typeof vi.fn>;
  generateStructuredOutput?: ReturnType<typeof vi.fn>;
  pricing?: { inputCostPerSecond?: number };
}

function makeHandler(
  checkLimit: ReturnType<typeof vi.fn>,
  overrides: HandlerOverrides = {}
) {
  const transcription = {
    transcribe:
      overrides.transcribe ??
      vi
        .fn()
        .mockResolvedValue({ isErr: () => true, error: { message: 'stop' } }),
  };
  const orchestrator = {
    selectModel: overrides.selectModel ?? vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  };
  const recordUsage = vi.fn().mockResolvedValue(undefined);
  const releaseReservation = vi.fn().mockResolvedValue(undefined);
  const rateLimit = { checkLimit, recordUsage, releaseReservation };
  const config = { get: () => 'model' };
  const catalog = {
    getPricing: () => overrides.pricing ?? { inputCostPerSecond: 0 },
  };
  const structured = {
    generateStructuredOutput: overrides.generateStructuredOutput ?? vi.fn(),
  };
  const handler = new VoiceNoteHandler(
    transcription as never,
    orchestrator as never,
    rateLimit as never,
    config as never,
    catalog as never,
    structured as never
  );
  return { handler, recordUsage, releaseReservation };
}

function okTranscribe() {
  return vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { text: 'hello world transcript', durationInSeconds: 3 },
  });
}

function okSelectModel() {
  return vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { toPrimitive: () => 'anthropic:claude-sonnet-4-20250514' },
  });
}

function okStructured() {
  return vi.fn().mockResolvedValue({
    object: { title: 'Title', content: '<p>Body</p>' },
    inputTokens: 12,
    outputTokens: 8,
  });
}

describe('VoiceNoteHandler anonymous budget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards isAnonymous into the rate-limit check', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler } = makeHandler(checkLimit);

    await handler.execute({
      userId: 'anon-1',
      audio: Buffer.from('x'),
      mode: 'create-note',
      isAnonymous: true,
    });

    expect(checkLimit).toHaveBeenCalledWith(
      'anon-1',
      expect.any(Number),
      true,
      false,
      expect.any(Number),
      undefined
    );
  });

  it('defaults isAnonymous to false for registered users', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler } = makeHandler(checkLimit);

    await handler.execute({
      userId: 'user-1',
      audio: Buffer.from('x'),
      mode: 'create-note',
    });

    expect(checkLimit).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      false,
      false,
      expect.any(Number),
      undefined
    );
  });

  it('threads the client IP into the rate-limit check', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler } = makeHandler(checkLimit);

    await handler.execute({
      userId: 'anon-1',
      audio: Buffer.from('x'),
      mode: 'create-note',
      isAnonymous: true,
      clientIp: '203.0.113.7',
    });

    expect(checkLimit).toHaveBeenCalledWith(
      'anon-1',
      expect.any(Number),
      true,
      false,
      expect.any(Number),
      '203.0.113.7'
    );
  });

  it('returns a rate-limit error when the anonymous budget is exhausted', async () => {
    const checkLimit = vi
      .fn()
      .mockResolvedValue({ allowed: false, reason: 'daily cap reached' });
    const { handler } = makeHandler(checkLimit);

    const result = await handler.execute({
      userId: 'anon-1',
      audio: Buffer.from('x'),
      mode: 'create-note',
      isAnonymous: true,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AIErrorCodes.RATE_LIMIT_EXCEEDED);
    }
  });
});

describe('VoiceNoteHandler reservation accounting', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    userId: 'user-1',
    audio: Buffer.from('x'),
    mode: 'create-note' as const,
  };

  it('reconciles the token reservation exactly once on success', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, recordUsage, releaseReservation } = makeHandler(
      checkLimit,
      {
        transcribe: okTranscribe(),
        selectModel: okSelectModel(),
        generateStructuredOutput: okStructured(),
      }
    );

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(releaseReservation).not.toHaveBeenCalled();
    const whisper = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.VOICE_TRANSCRIPTION
    )?.[0];
    const structuring = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.STRUCTURE_VOICE_NOTE
    )?.[0];
    expect(whisper?.estimatedTokens).toBe(0);
    expect(structuring?.estimatedTokens).toBeGreaterThan(0);
    const estimatedArgs = recordUsage.mock.calls.map(
      (c) => c[0].estimatedTokens as number
    );
    expect(estimatedArgs.filter((n) => n > 0)).toHaveLength(1);
  });

  it('releases the reservation when transcription fails', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, releaseReservation } = makeHandler(checkLimit);

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      expect.any(Number),
      undefined
    );
  });

  it('releases the reservation when transcription produces no text', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, releaseReservation } = makeHandler(checkLimit, {
      transcribe: vi.fn().mockResolvedValue({
        isErr: () => false,
        value: { text: '   ', durationInSeconds: 1 },
      }),
    });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      expect.any(Number),
      undefined
    );
  });

  it('releases the reservation exactly once when structuring model selection fails', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, recordUsage, releaseReservation } = makeHandler(
      checkLimit,
      {
        transcribe: okTranscribe(),
        selectModel: vi.fn().mockResolvedValue({
          isErr: () => true,
          error: { code: 'AI_PROVIDER_ERROR', message: 'no model' },
        }),
      }
    );

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      expect.any(Number),
      undefined
    );
    const estimatedArgs = recordUsage.mock.calls.map(
      (c) => c[0].estimatedTokens as number
    );
    expect(estimatedArgs.filter((n) => n > 0)).toHaveLength(0);
  });

  it('releases the reservation when structuring fails and falls back to raw transcript', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, recordUsage, releaseReservation } = makeHandler(
      checkLimit,
      {
        transcribe: okTranscribe(),
        selectModel: okSelectModel(),
        generateStructuredOutput: vi.fn().mockRejectedValue(new Error('boom')),
      }
    );

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith(
      'user-1',
      expect.any(Number),
      expect.any(Number),
      undefined
    );
    const structuring = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.STRUCTURE_VOICE_NOTE
    );
    expect(structuring).toBeUndefined();
  });
});

describe('VoiceNoteHandler cost reserve', () => {
  beforeEach(() => vi.clearAllMocks());

  const audio = Buffer.alloc(120_000);
  const estimatedDurationSeconds = 10;
  const pricing = { inputCostPerSecond: 0.0001 };
  const reservedCostUsd = estimatedDurationSeconds * pricing.inputCostPerSecond;
  const input = {
    userId: 'user-1',
    audio,
    mode: 'create-note' as const,
  };

  it('reserves the estimated transcription cost in the rate-limit check', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler } = makeHandler(checkLimit, { pricing });

    await handler.execute(input);

    const call = checkLimit.mock.calls[0];
    expect(call[4]).toBeCloseTo(reservedCostUsd, 12);
  });

  it('reconciles the cost reserve on the whisper leg and none on the structuring leg', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, recordUsage } = makeHandler(checkLimit, {
      pricing,
      transcribe: okTranscribe(),
      selectModel: okSelectModel(),
      generateStructuredOutput: okStructured(),
    });

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    const whisper = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.VOICE_TRANSCRIPTION
    )?.[0];
    const structuring = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.STRUCTURE_VOICE_NOTE
    )?.[0];
    expect(whisper?.estimatedCostUsd).toBeCloseTo(reservedCostUsd, 12);
    expect(structuring?.estimatedCostUsd).toBe(0);
  });

  it('releases the cost reserve when transcription fails before the whisper leg', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, releaseReservation } = makeHandler(checkLimit, {
      pricing,
    });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    const [, , releasedCost] = releaseReservation.mock.calls[0];
    expect(releasedCost).toBeCloseTo(reservedCostUsd, 12);
  });

  it('releases only the token reserve once the whisper leg reconciled the cost', async () => {
    const checkLimit = vi.fn().mockResolvedValue({ allowed: true });
    const { handler, releaseReservation } = makeHandler(checkLimit, {
      pricing,
      transcribe: okTranscribe(),
      selectModel: okSelectModel(),
      generateStructuredOutput: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    const [, , releasedCost] = releaseReservation.mock.calls[0];
    expect(releasedCost).toBe(0);
  });
});
