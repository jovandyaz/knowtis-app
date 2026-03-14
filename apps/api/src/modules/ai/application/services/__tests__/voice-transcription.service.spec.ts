import { experimental_transcribe } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIErrorCodes } from '../../../domain/errors/ai.errors';
import { createMockConfig } from '../../../testing/create-mock-config';
import { VoiceTranscriptionService } from '../voice-transcription.service';

vi.mock('ai', () => ({
  experimental_transcribe: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    transcription: vi.fn((modelId: string) => `mock-transcription:${modelId}`),
  })),
}));

const mockTranscribe = vi.mocked(experimental_transcribe);

describe('VoiceTranscriptionService', () => {
  let service: VoiceTranscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockConfig = createMockConfig({ OPENAI_API_KEY: 'test-key' });
    service = new VoiceTranscriptionService(mockConfig);
  });

  it('should return ok with transcribed text on success', async () => {
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
    expect(result._unsafeUnwrap()).toBe('Hello, world!');
    expect(mockTranscribe).toHaveBeenCalledWith({
      model: 'mock-transcription:whisper-1',
      audio: audioBuffer,
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
    expect(result._unsafeUnwrap()).toBe('Hola, mundo!');
    expect(mockTranscribe).toHaveBeenCalledWith({
      model: 'mock-transcription:whisper-1',
      audio: audioBuffer,
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
    expect(error.message).toBe('AI provider error: API rate limit exceeded');
  });

  it('should return err with generic message for non-Error throws', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribe.mockRejectedValue('unknown failure');

    const result = await service.transcribe(audioBuffer);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(error.message).toBe('AI provider error: Transcription failed');
  });
});
