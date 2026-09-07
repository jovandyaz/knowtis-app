import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';
import type {
  LatestQuizAttemptResponse,
  QuizContent,
  QuizQuestionReview,
} from '@knowtis/shared-types';

import type { ArtifactDomainError } from '../../domain/errors/artifact.errors';
import {
  ARTIFACT_READ_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import { missedQuestionIndexes } from '../../domain/services/missed-question-indexes';
import { loadOwnedArtifact } from '../services/load-owned-artifact';

interface GetLatestQuizAttemptInput {
  artifactId: string;
  userId: string;
}

@Injectable()
export class GetLatestQuizAttemptHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly readRepo: ArtifactReadRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizAttemptRepo: QuizAttemptRepository
  ) {}

  async execute(
    input: GetLatestQuizAttemptInput
  ): Promise<Result<LatestQuizAttemptResponse, ArtifactDomainError>> {
    const owned = await loadOwnedArtifact(
      this.readRepo,
      input.artifactId,
      input.userId,
      ARTIFACT_TYPE.QUIZ
    );

    if (owned.isErr()) {
      return err(owned.error);
    }

    const latest = await this.quizAttemptRepo.findLatestFull(
      input.artifactId,
      input.userId
    );

    if (!latest) {
      return ok({ latest: null });
    }

    const questions = (owned.value.content as QuizContent).questions;
    const review = latest.answers.flatMap((answer): QuizQuestionReview[] => {
      const question = questions[answer.questionIndex];
      return question
        ? [
            {
              questionIndex: answer.questionIndex,
              question: question.question,
              options: question.options,
              selectedIndex: answer.selectedIndex,
              correctIndex: question.correctIndex,
              explanation: question.explanation,
            },
          ]
        : [];
    });

    return ok({
      latest: {
        score: latest.score,
        completedAt: latest.completedAt,
        review,
        missedQuestionIndexes: missedQuestionIndexes(latest.answers),
      },
    });
  }
}
