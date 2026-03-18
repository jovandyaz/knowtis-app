import { Inject, Injectable } from '@nestjs/common';

import type { FlashcardProgress } from '@knowtis/shared-types';

import {
  ARTIFACT_READ_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  type ArtifactReadRepository,
  type FlashcardProgressRepository,
} from '../../domain/ports';

@Injectable()
export class GetFlashcardProgressHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly artifactReadRepo: ArtifactReadRepository,
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(input: {
    artifactId: string;
    userId: string;
  }): Promise<FlashcardProgress[]> {
    const artifact = await this.artifactReadRepo.findById(input.artifactId);
    if (!artifact || artifact.userId !== input.userId) {
      return [];
    }

    return this.progressRepo.getProgress(input.artifactId, input.userId);
  }
}
