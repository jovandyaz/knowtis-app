import { transcribe } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIErrorCodes } from '../../../domain/errors/ai.errors';
import { createMockConfig } from '../../../testing/create-mock-config';
import { VoiceTranscriptionService } from '../voice-transcription.service';

vi.mock('ai', () => ({
  transcribe: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    transcription: vi.fn((modelId: string) => `mock-transcription:${modelId}`),
  })),
}));

const mockTranscribe = vi.mocked(transcribe);

describe('VoiceTranscriptionService', () => {
  let service: VoiceTranscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockConfig = createMockConfig({ OPENAI_API_KEY: 'test-key' });
    service = new VoiceTranscriptionService(mockConfig);
  });

  it('should reject a non-openai transcription model at construction', () => {
    const config = createMockConfig({
      OPENAI_API_KEY: 'test-key',
      AI_TRANSCRIPTION_MODEL: 'anthropic:claude-haiku-4-5',
    });
    expect(() => new VoiceTranscriptionService(config)).toThrow(
      /only 'openai:<model>' transcription is available/
    );
  });

  it('should return err(PROVIDER_ERROR) when OPENAI_API_KEY is missing', async () => {
    const keyless = new VoiceTranscriptionService(
      createMockConfig({ OPENAI_API_KEY: '' })
    );

    const result = await keyless.transcribe(Buffer.from('fake-audio-data'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('should return ok with text and duration on success', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockResolvedValue({
      text: 'Hello, world!',
      segments: [],
      language: 'en',
      durationInSeconds: 1.5,
      warnings: [],
      responses: [],
      providerMetadata: {},
    });

    const result = await service.transcribe(audioBuffer);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      text: 'Hello, world!',
      durationInSeconds: 1.5,
    });
    expect(mockTranscribe).toHaveBeenCalledWith({
      model: 'mock-transcription:whisper-1',
      audio: audioBuffer,
      abortSignal: expect.any(AbortSignal),
    });
  });

  it('should pass language option to providerOptions when provided', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockResolvedValue({
      text: 'Hola, mundo!',
      segments: [],
      language: 'es',
      durationInSeconds: 1.2,
      warnings: [],
      responses: [],
      providerMetadata: {},
    });

    const result = await service.transcribe(audioBuffer, 'es');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().text).toBe('Hola, mundo!');
    expect(mockTranscribe).toHaveBeenCalledWith({
      model: 'mock-transcription:whisper-1',
      audio: audioBuffer,
      abortSignal: expect.any(AbortSignal),
      providerOptions: { openai: { language: 'es' } },
    });
  });

  it('should return err with PROVIDER_ERROR when transcription fails', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockRejectedValue(new Error('API rate limit exceeded'));

    const result = await service.transcribe(audioBuffer);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(error.message).toBe('AI provider error: Voice transcription failed');
    expect(error.message).not.toContain('API rate limit exceeded');
  });

  it('should return err with generic message for non-Error throws', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockRejectedValue('unknown failure');

    const result = await service.transcribe(audioBuffer);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(error.message).toBe('AI provider error: Voice transcription failed');
  });

  it('should not leak sensitive API key info in provider errors', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockRejectedValue(
      new Error('401 invalid api key: sk-proj-abcdef123456')
    );

    const result = await service.transcribe(audioBuffer);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(error.message).toContain('Voice transcription failed');
    expect(error.message).not.toContain('sk-proj');
    expect(error.message).not.toContain('401');
  });
});
