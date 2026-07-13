import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { AIErrorCodes } from '../../domain/errors/ai.errors';
import { VoiceNoteHandler } from './voice-note.handler';

interface HandlerOverrides {
  transcribe?: ReturnType<typeof vi.fn>;
  selectModel?: ReturnType<typeof vi.fn>;
  generateStructuredOutput?: ReturnType<typeof vi.fn>;
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
  const catalog = { getPricing: () => ({ inputCostPerSecond: 0 }) };
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

    expect(checkLimit).toHaveBeenCalledWith('anon-1', expect.any(Number), true);
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
      false
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
      expect.any(Number)
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
      expect.any(Number)
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
      expect.any(Number)
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
      expect.any(Number)
    );
    const structuring = recordUsage.mock.calls.find(
      (c) => c[0].action === AI_ACTION.STRUCTURE_VOICE_NOTE
    );
    expect(structuring).toBeUndefined();
  });
});
