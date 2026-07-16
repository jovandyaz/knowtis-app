import { join } from 'node:path';

import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIErrorCodes } from '../../../domain/errors/ai.errors';
import type { AIStructuredOutputProvider } from '../../../domain/ports/ai-structured-output.port';
import type { AIUsageRepository } from '../../../domain/ports/ai-usage.repository';
import { createMockConfig } from '../../../testing/create-mock-config';
import { createTestCatalog } from '../../../testing/create-test-catalog';
import type { AIConfigService } from '../../services/ai-config.service';
import { AIOrchestrator } from '../../services/ai-orchestrator.service';
import { AIRateLimitService } from '../../services/ai-rate-limit.service';
import { PromptLoaderService } from '../../services/prompt-loader.service';
import { VoiceTranscriptionService } from '../../services/voice-transcription.service';
import { VoiceNoteHandler } from '../voice-note.handler';

describe('VoiceNoteHandler', () => {
  let handler: VoiceNoteHandler;
  let mockUsageRepo: AIUsageRepository;
  let mockTranscriptionService: VoiceTranscriptionService;
  let mockStructuredOutputProvider: AIStructuredOutputProvider;

  const mockConfig = createMockConfig({ ANTHROPIC_API_KEY: 'test-key' });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUsageRepo = {
      getDailyUsage: vi.fn().mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      }),
      recordUsage: vi.fn(),
      getMetricsSummary: vi.fn(),
      getGlobalDailyUsage: vi.fn(),
      getGlobalMetricsSummary: vi.fn(),
    };

    mockTranscriptionService = {
      transcribe: vi.fn(),
    } as unknown as VoiceTranscriptionService;

    mockStructuredOutputProvider = {
      generateStructuredOutput: vi.fn(),
    };

    const mockAIConfigService = {
      getDefaultModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-sonnet-4-20250514'),
      getFastModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-haiku-4-5-20251001'),
      getFallbackModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-haiku-4-5-20251001'),
      setConfig: vi.fn().mockResolvedValue(undefined),
    } as unknown as AIConfigService;
    const promptLoader = new PromptLoaderService(
      join(__dirname, '../../../prompts')
    );
    promptLoader.onModuleInit();
    const orchestrator = new AIOrchestrator(
      mockAIConfigService,
      promptLoader,
      createTestCatalog()
    );
    const rateLimitService = new AIRateLimitService(mockUsageRepo, mockConfig);

    handler = new VoiceNoteHandler(
      mockTranscriptionService,
      orchestrator,
      rateLimitService,
      mockConfig,
      createTestCatalog(),
      mockStructuredOutputProvider
    );
  });

  it('should return structured note on successful transcription + structuring', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({
        text: 'Meeting notes: We decided to launch the product next week.',
        durationInSeconds: 120,
      })
    );

    vi.mocked(
      mockStructuredOutputProvider.generateStructuredOutput
    ).mockResolvedValue({
      object: {
        title: 'Product Launch Meeting',
        content:
          '<h2>Meeting Notes</h2><ul><li>Launch product next week</li></ul>',
      },
      inputTokens: 200,
      outputTokens: 80,
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.title).toBe('Product Launch Meeting');
      expect(result.value.content).toBe(
        '<h2>Meeting Notes</h2><ul><li>Launch product next week</li></ul>'
      );
      expect(result.value.transcript).toBe(
        'Meeting notes: We decided to launch the product next week.'
      );
    }

    expect(mockUsageRepo.recordUsage).toHaveBeenCalledTimes(2);
  });

  it('should price transcription from the catalog using the real audio duration', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({ text: 'Catalog priced transcript.', durationInSeconds: 120 })
    );

    vi.mocked(
      mockStructuredOutputProvider.generateStructuredOutput
    ).mockResolvedValue({
      object: { title: 'T', content: '<p>C</p>' },
      inputTokens: 100,
      outputTokens: 40,
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    const transcriptionUsage = vi
      .mocked(mockUsageRepo.recordUsage)
      .mock.calls.map(([usage]) => usage)
      .find((usage) => usage.model === 'openai:whisper-1');
    expect(transcriptionUsage).toBeDefined();
    expect(transcriptionUsage!.costUsd).toBeCloseTo(120 * 0.0001, 10);
  });

  it('should fall back to a byte-based duration estimate when the provider omits it', async () => {
    const audio = Buffer.alloc(120_000);
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({ text: 'No duration reported.', durationInSeconds: undefined })
    );

    vi.mocked(
      mockStructuredOutputProvider.generateStructuredOutput
    ).mockRejectedValue(new Error('skip structuring'));

    await handler.execute({
      userId: 'user-123',
      audio,
      mode: 'create-note',
    });

    const transcriptionUsage = vi
      .mocked(mockUsageRepo.recordUsage)
      .mock.calls.map(([usage]) => usage)
      .find((usage) => usage.model === 'openai:whisper-1');
    expect(transcriptionUsage!.costUsd).toBeCloseTo(10 * 0.0001, 10);
  });

  it('should return err(PROVIDER_ERROR) when transcription fails', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      err({
        code: AIErrorCodes.PROVIDER_ERROR,
        message: 'AI provider error: Whisper API failed',
      })
    );

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    }
  });

  it('should return err(RATE_LIMIT_EXCEEDED) when rate limit is exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99999,
      totalOutputTokens: 99999,
      totalCostUsd: 2.0,
      requestCount: 50,
    });

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AIErrorCodes.RATE_LIMIT_EXCEEDED);
    }
  });

  it('should return err(INVALID_INPUT) when transcription is empty', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({ text: '', durationInSeconds: 2 })
    );

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AIErrorCodes.INVALID_INPUT);
    }
  });

  it('should return err(INVALID_INPUT) when transcription is whitespace-only', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({ text: '   \n  ', durationInSeconds: 2 })
    );

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AIErrorCodes.INVALID_INPUT);
    }
  });

  it('should fall back to raw transcript when structuring fails', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({
        text: 'Some raw voice transcription content.',
        durationInSeconds: 30,
      })
    );

    vi.mocked(
      mockStructuredOutputProvider.generateStructuredOutput
    ).mockRejectedValue(new Error('Claude API error'));

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.title).toBe('Some raw voice transcription content.');
      expect(result.value.content).toBe(
        '<p>Some raw voice transcription content.</p>'
      );
      expect(result.value.transcript).toBe(
        'Some raw voice transcription content.'
      );
    }
  });

  it('should pass language to transcription service when provided', async () => {
    vi.mocked(mockTranscriptionService.transcribe).mockResolvedValue(
      ok({ text: 'Hola mundo.', durationInSeconds: 5 })
    );

    vi.mocked(
      mockStructuredOutputProvider.generateStructuredOutput
    ).mockResolvedValue({
      object: {
        title: 'Nota de Voz',
        content: '<p>Hola mundo.</p>',
      },
      inputTokens: 100,
      outputTokens: 40,
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    const result = await handler.execute({
      userId: 'user-123',
      audio: Buffer.from('fake-audio'),
      mode: 'create-note',
      language: 'es',
    });

    expect(result.isOk()).toBe(true);
    expect(mockTranscriptionService.transcribe).toHaveBeenCalledWith(
      Buffer.from('fake-audio'),
      'es'
    );
  });
});
