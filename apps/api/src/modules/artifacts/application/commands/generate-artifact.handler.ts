import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import type { ZodType } from 'zod';

import {
  AI_ACTION,
  type ArtifactContent,
  type ArtifactType,
} from '@knowtis/shared-types';

import { sanitizeContent } from '../../../ai/domain/services/input-sanitizer';
import { estimateTokenCount } from '../../../ai/domain/services/token-estimator';
import type { SupportedAIAction } from '../../../ai/domain/value-objects/ai-action.vo';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_WRITE_REPOSITORY,
  type ArtifactEntity,
  type ArtifactWriteRepository,
} from '../../domain/ports';
import {
  flashcardDeckOutputSchema,
  mindMapOutputSchema,
  quizOutputSchema,
  summaryOutputSchema,
} from '../../domain/schemas/artifact-output.schemas';
import { AIGenerationPipeline } from '../services/ai-generation.pipeline';

interface GenerateArtifactInput {
  userId: string;
  noteId: string;
  noteContent: string;
  noteTitle: string;
  type: ArtifactType;
}

const ACTION_MAP: Record<ArtifactType, SupportedAIAction> = {
  flashcard_deck: AI_ACTION.GENERATE_FLASHCARDS,
  quiz: AI_ACTION.GENERATE_QUIZ,
  summary: AI_ACTION.GENERATE_SUMMARY,
  mind_map: AI_ACTION.GENERATE_MIND_MAP,
};

const SCHEMA_MAP = {
  flashcard_deck: flashcardDeckOutputSchema,
  quiz: quizOutputSchema,
  summary: summaryOutputSchema,
  mind_map: mindMapOutputSchema,
} as const;

const TITLE_PREFIX_MAP: Record<ArtifactType, string> = {
  flashcard_deck: 'Flashcards',
  quiz: 'Quiz',
  summary: 'Summary',
  mind_map: 'Mind Map',
};

@Injectable()
export class GenerateArtifactHandler {
  constructor(
    @Inject(ARTIFACT_WRITE_REPOSITORY)
    private readonly repository: ArtifactWriteRepository,
    private readonly pipeline: AIGenerationPipeline
  ) {}

  async execute(
    input: GenerateArtifactInput
  ): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
    const sanitizedContent = sanitizeContent(input.noteContent);

    if (!sanitizedContent) {
      return err(ArtifactErrors.emptyContent());
    }

    const action = ACTION_MAP[input.type];
    const schema = SCHEMA_MAP[input.type];

    const genResult = await this.pipeline.execute({
      userId: input.userId,
      action,
      prompt: sanitizedContent,
      schema: schema as ZodType,
      estimatedTokens: estimateTokenCount(sanitizedContent),
      logContext: { noteId: input.noteId, type: input.type },
    });

    if (genResult.isErr()) {
      return err(genResult.error);
    }

    const title = `${TITLE_PREFIX_MAP[input.type]}: ${input.noteTitle}`;

    const createResult = await this.repository.create({
      type: input.type,
      userId: input.userId,
      sourceNoteId: input.noteId,
      title,
      content: genResult.value.object as ArtifactContent,
    });

    if (createResult.isErr()) {
      return err(createResult.error);
    }

    return ok(createResult.value);
  }
}
