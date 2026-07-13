import { createOpenAI } from '@ai-sdk/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { experimental_transcribe as transcribe } from 'ai';
import { err, ok, type Result } from 'neverthrow';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIDomainError } from '../../domain/errors/ai.errors';
import { AIErrors } from '../../domain/errors/ai.errors';

export interface TranscriptionOutput {
  readonly text: string;
  readonly durationInSeconds: number | undefined;
}

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);
  private readonly openai;
  private readonly model: string;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    this.openai = createOpenAI({ apiKey: apiKey || undefined });
    this.model = resolveTranscriptionModel(
      this.configService.get('AI_TRANSCRIPTION_MODEL')
    );
  }

  async transcribe(
    audio: Buffer,
    language?: string
  ): Promise<Result<TranscriptionOutput, AIDomainError>> {
    if (!this.configService.get('OPENAI_API_KEY')) {
      return err(AIErrors.providerError('OPENAI_API_KEY is not configured'));
    }

    try {
      const result = await transcribe({
        model: this.openai.transcription(this.model),
        audio,
        abortSignal: AbortSignal.timeout(
          this.configService.get('AI_TIMEOUT_MS')
        ),
        ...(language && {
          providerOptions: { openai: { language } },
        }),
      });

      return ok({
        text: result.text,
        durationInSeconds: result.durationInSeconds,
      });
    } catch (error) {
      this.logger.error({
        event: 'ai.transcription.error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return err(AIErrors.providerError('Voice transcription failed'));
    }
  }
}

function resolveTranscriptionModel(modelId: string): string {
  const separator = modelId.indexOf(':');
  const provider = separator > 0 ? modelId.slice(0, separator) : '';
  if (provider !== 'openai') {
    throw new Error(
      `AI_TRANSCRIPTION_MODEL '${modelId}' is not supported: only 'openai:<model>' transcription is available`
    );
  }
  return modelId.slice(separator + 1);
}
