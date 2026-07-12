import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceNoteHandler } from './voice-note.handler';

function makeHandler(checkLimit: ReturnType<typeof vi.fn>) {
  const transcription = {
    transcribe: vi
      .fn()
      .mockResolvedValue({ isErr: () => true, error: { message: 'stop' } }),
  };
  const orchestrator = { selectModel: vi.fn(), getSystemPrompt: vi.fn() };
  const rateLimit = {
    checkLimit,
    recordUsage: vi.fn(),
    releaseReservation: vi.fn(),
  };
  const config = { get: () => 'model' };
  const catalog = { getPricing: () => ({ inputCostPerSecond: 0 }) };
  const structured = { generateStructuredOutput: vi.fn() };
  const handler = new VoiceNoteHandler(
    transcription as never,
    orchestrator as never,
    rateLimit as never,
    config as never,
    catalog as never,
    structured as never
  );
  return { handler };
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
});
