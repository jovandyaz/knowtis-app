import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { AI_ACTION } from '@knowtis/shared-types';

import { sanitizeContent } from '../../../ai/domain/services/input-sanitizer';
import { estimateTokenCount } from '../../../ai/domain/services/token-estimator';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import { learnTopicOutputSchema } from '../../domain/schemas/artifact-output.schemas';
import { AIGenerationPipeline } from '../services/ai-generation.pipeline';

const LEARN_TOPIC_OUTPUT_TOKEN_BUFFER = 2000;

interface LearnTopicInput {
  userId: string;
  topic: string;
}

export interface LearnTopicOutput {
  title: string;
  content: string;
}

@Injectable()
export class LearnTopicHandler {
  constructor(private readonly pipeline: AIGenerationPipeline) {}

  async execute(
    input: LearnTopicInput
  ): Promise<Result<LearnTopicOutput, ArtifactDomainError>> {
    const sanitizedTopic = sanitizeContent(input.topic);

    if (!sanitizedTopic) {
      return err(
        ArtifactErrors.generationFailed('Topic is empty after sanitization')
      );
    }

    const estimatedTokens =
      estimateTokenCount(sanitizedTopic) + LEARN_TOPIC_OUTPUT_TOKEN_BUFFER;

    const genResult = await this.pipeline.execute({
      userId: input.userId,
      action: AI_ACTION.LEARN_TOPIC,
      prompt: sanitizedTopic,
      schema: learnTopicOutputSchema,
      estimatedTokens,
      logContext: { topic: input.topic },
    });

    if (genResult.isErr()) {
      return err(genResult.error);
    }

    return ok({
      title: genResult.value.object.title,
      content: genResult.value.object.content,
    });
  }
}
