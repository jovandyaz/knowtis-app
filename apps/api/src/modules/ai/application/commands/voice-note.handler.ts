import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';
import { AI_ACTION } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors, type AIDomainError } from '../../domain/errors/ai.errors';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from '../../domain/ports/ai-structured-output.port';
import type { AIStructuredOutputProvider } from '../../domain/ports/ai-structured-output.port';
import { voiceNoteOutputSchema } from '../../domain/schemas/voice-note.schema';
import { TokenUsage } from '../../domain/value-objects/token-usage.vo';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { AIRateLimitService } from '../services/ai-rate-limit.service';
import { VoiceTranscriptionService } from '../services/voice-transcription.service';

interface VoiceNoteInput {
  readonly userId: string;
  readonly audio: Buffer;
  readonly mode: 'create-note' | 'insert';
  readonly language?: string;
  readonly isAnonymous?: boolean;
  readonly clientIp?: string;
}

export interface VoiceNoteOutput {
  readonly title: string;
  readonly content: string;
  readonly transcript: string;
}

const WEBM_BYTES_PER_SECOND = 12_000;
const ESTIMATED_TOKENS_PER_SECOND = 25;

@Injectable()
export class VoiceNoteHandler {
  private readonly logger = new Logger(VoiceNoteHandler.name);

  constructor(
    private readonly transcriptionService: VoiceTranscriptionService,
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structuredOutputProvider: AIStructuredOutputProvider
  ) {}

  async execute(
    input: VoiceNoteInput
  ): Promise<Result<VoiceNoteOutput, AIDomainError>> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const estimatedTokens = this.estimateTokensFromAudio(input.audio);
    const transcriptionModel = this.configService.get('AI_TRANSCRIPTION_MODEL');
    const estimatedCostUsd =
      this.estimateAudioDurationSeconds(input.audio) *
      (this.modelCatalog.getPricing(transcriptionModel)?.inputCostPerSecond ??
        0);
    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens,
      input.isAnonymous ?? false,
      false,
      estimatedCostUsd,
      input.clientIp
    );
    if (!rateLimitCheck.allowed) {
      this.logger.warn({
        event: 'ai.voice-note.rejected',
        requestId,
        userId: input.userId,
        reason: rateLimitCheck.reason,
      });
      return err(AIErrors.rateLimitExceeded());
    }

    this.logger.log({
      event: 'ai.voice-note.start',
      requestId,
      userId: input.userId,
      audioSizeBytes: input.audio.length,
      mode: input.mode,
    });

    const transcriptionResult = await this.transcriptionService.transcribe(
      input.audio,
      input.language
    );
    if (transcriptionResult.isErr()) {
      this.logger.error({
        event: 'ai.voice-note.transcription-error',
        requestId,
        userId: input.userId,
        error: transcriptionResult.error.message,
        latencyMs: Date.now() - startTime,
      });
      await this.rateLimitService.releaseReservation(
        input.userId,
        estimatedTokens,
        estimatedCostUsd,
        input.isAnonymous ?? false,
        input.clientIp
      );
      return err(transcriptionResult.error);
    }

    const { text: transcript, durationInSeconds } = transcriptionResult.value;

    if (!transcript.trim()) {
      this.logger.warn({
        event: 'ai.voice-note.empty-transcription',
        requestId,
        userId: input.userId,
        latencyMs: Date.now() - startTime,
      });
      await this.rateLimitService.releaseReservation(
        input.userId,
        estimatedTokens,
        estimatedCostUsd,
        input.isAnonymous ?? false,
        input.clientIp
      );
      return err(
        AIErrors.invalidInput(
          'Transcription produced no text. Please try again with clearer audio.'
        )
      );
    }

    const billedSeconds =
      durationInSeconds ?? this.estimateAudioDurationSeconds(input.audio);
    const costPerSecond =
      this.modelCatalog.getPricing(transcriptionModel)?.inputCostPerSecond ?? 0;
    const whisperCostUsd = billedSeconds * costPerSecond;
    this.rateLimitService
      .recordUsage({
        userId: input.userId,
        action: AI_ACTION.VOICE_TRANSCRIPTION,
        model: transcriptionModel,
        // The structuring leg reconciles the token reserve; this leg reconciles
        // the cost reserve. Crossing them would subtract each reserve twice.
        estimatedTokens: 0,
        estimatedCostUsd,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: whisperCostUsd,
        ...(input.isAnonymous ? { isAnonymous: true } : {}),
        ...(input.clientIp ? { clientIp: input.clientIp } : {}),
      })
      .catch((err) =>
        this.logger.warn({
          event: 'ai.usage.record_failed',
          requestId,
          userId: input.userId,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );

    this.logger.log({
      event: 'ai.voice-note.transcription-complete',
      requestId,
      userId: input.userId,
      transcriptLength: transcript.length,
      durationInSeconds: billedSeconds,
      whisperCostUsd,
      latencyMs: Date.now() - startTime,
    });

    try {
      const modelResult = await this.orchestrator.selectModel(
        AI_ACTION.STRUCTURE_VOICE_NOTE
      );
      if (modelResult.isErr()) {
        await this.rateLimitService.releaseReservation(
          input.userId,
          estimatedTokens,
          0,
          input.isAnonymous ?? false,
          input.clientIp
        );
        return err(modelResult.error);
      }
      const model = modelResult.value.toPrimitive();

      const systemPrompt = this.orchestrator.getSystemPrompt(
        AI_ACTION.STRUCTURE_VOICE_NOTE
      );

      const result =
        await this.structuredOutputProvider.generateStructuredOutput(
          transcript,
          voiceNoteOutputSchema,
          {
            model,
            system: systemPrompt,
            maxRetries: this.configService.get('AI_MAX_RETRIES'),
          }
        );

      const { inputTokens, outputTokens } = result;

      const usage = TokenUsage.create(
        { inputTokens, outputTokens, model },
        this.modelCatalog.getPricing(model)
      );

      this.rateLimitService
        .recordUsage({
          userId: input.userId,
          action: AI_ACTION.STRUCTURE_VOICE_NOTE,
          model,
          estimatedTokens,
          estimatedCostUsd: 0,
          inputTokens,
          outputTokens,
          costUsd: usage.costUsd,
          ...(input.isAnonymous ? { isAnonymous: true } : {}),
          ...(input.clientIp ? { clientIp: input.clientIp } : {}),
        })
        .catch((err) =>
          this.logger.warn({
            event: 'ai.usage.record_failed',
            requestId,
            userId: input.userId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        );

      this.logger.log({
        event: 'ai.voice-note.complete',
        requestId,
        userId: input.userId,
        model,
        inputTokens,
        outputTokens,
        totalCostUsd: whisperCostUsd + usage.costUsd,
        latencyMs: Date.now() - startTime,
        status: 'success',
      });

      return ok({
        title: result.object.title,
        content: result.object.content,
        transcript,
      });
    } catch (error) {
      this.logger.warn({
        event: 'ai.voice-note.structuring-fallback',
        requestId,
        userId: input.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });

      await this.rateLimitService.releaseReservation(
        input.userId,
        estimatedTokens,
        0,
        input.isAnonymous ?? false,
        input.clientIp
      );

      const fallbackTitle = this.buildFallbackTitle(transcript);

      return ok({
        title: fallbackTitle,
        content: `<p>${this.escapeHtml(transcript)}</p>`,
        transcript,
      });
    }
  }

  private estimateAudioDurationSeconds(audio: Buffer): number {
    return audio.length / WEBM_BYTES_PER_SECOND;
  }

  private estimateTokensFromAudio(audio: Buffer): number {
    return Math.ceil(
      this.estimateAudioDurationSeconds(audio) * ESTIMATED_TOKENS_PER_SECOND
    );
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildFallbackTitle(transcript: string): string {
    const MAX_LENGTH = 50;
    const cleaned = transcript.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= MAX_LENGTH) {
      return cleaned;
    }

    const truncated = cleaned.slice(0, MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 15 ? truncated.slice(0, lastSpace) : truncated) + '…';
  }
}
