import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';
import type { QuizAttempt, QuizContent } from '@knowtis/shared-types';

import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_READ_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type QuizAttemptRepository,
} from '../../domain/ports';

interface SubmitQuizAttemptInput {
  artifactId: string;
  userId: string;
  answers: { questionIndex: number; selectedIndex: number }[];
}

@Injectable()
export class SubmitQuizAttemptHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly readRepo: ArtifactReadRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizAttemptRepo: QuizAttemptRepository
  ) {}

  async execute(
    input: SubmitQuizAttemptInput
  ): Promise<Result<QuizAttempt, ArtifactDomainError>> {
    const artifact = await this.readRepo.findById(input.artifactId);

    if (!artifact || artifact.userId !== input.userId) {
      return err(ArtifactErrors.notFound(input.artifactId));
    }

    if (artifact.type !== ARTIFACT_TYPE.QUIZ) {
      return err(ArtifactErrors.invalidType(artifact.type));
    }

    const quizContent = artifact.content as QuizContent;
    const gradedAnswers = input.answers.map((answer) => {
      const question = quizContent.questions[answer.questionIndex];
      return {
        questionIndex: answer.questionIndex,
        selectedIndex: answer.selectedIndex,
        correct: question
          ? answer.selectedIndex === question.correctIndex
          : false,
      };
    });

    const correctCount = gradedAnswers.filter((a) => a.correct).length;
    const totalQuestions = quizContent.questions.length;
    const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;

    const createResult = await this.quizAttemptRepo.create({
      artifactId: input.artifactId,
      userId: input.userId,
      score,
      answers: gradedAnswers,
    });

    if (createResult.isErr()) {
      return err(createResult.error);
    }

    return ok(createResult.value);
  }
}
