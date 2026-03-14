import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { experimental_transcribe as transcribe } from 'ai';
import { err, ok, type Result } from 'neverthrow';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIDomainError } from '../../domain/errors/ai.errors';
import { AIErrors } from '../../domain/errors/ai.errors';

@Injectable()
export class VoiceTranscriptionService {
  private readonly openai;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    this.openai = createOpenAI({ apiKey: apiKey || undefined });
  }

  async transcribe(
    audio: Buffer,
    language?: string
  ): Promise<Result<string, AIDomainError>> {
    try {
      const result = await transcribe({
        model: this.openai.transcription('whisper-1'),
        audio,
        ...(language && {
          providerOptions: { openai: { language } },
        }),
      });

      return ok(result.text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Transcription failed';
      return err(AIErrors.providerError(message));
    }
  }
}
