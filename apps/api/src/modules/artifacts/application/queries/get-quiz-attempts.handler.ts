import { Inject, Injectable } from '@nestjs/common';

import type { QuizAttempt } from '@knowtis/shared-types';

import {
  ARTIFACT_READ_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type QuizAttemptRepository,
} from '../../domain/ports';

@Injectable()
export class GetQuizAttemptsHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly artifactReadRepo: ArtifactReadRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizAttemptRepo: QuizAttemptRepository
  ) {}

  async execute(input: {
    artifactId: string;
    userId: string;
  }): Promise<QuizAttempt[]> {
    const artifact = await this.artifactReadRepo.findById(input.artifactId);
    if (!artifact || artifact.userId !== input.userId) {
      return [];
    }

    return this.quizAttemptRepo.findByArtifact(input.artifactId, input.userId);
  }
}
