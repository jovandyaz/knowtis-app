import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  ARTIFACT_TYPE,
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttempt,
  type QuizAttemptScope,
  type QuizContent,
} from '@knowtis/shared-types';

import type { ArtifactDomainError } from '../../domain/errors/artifact.errors';
import { QuizCompletedEvent } from '../../domain/events/quiz-completed.event';
import {
  ARTIFACT_READ_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import {
  gradeQuizAttempt,
  resolveMissedScope,
  validateQuizAnswers,
  type QuizAnswer,
} from '../../domain/services/quiz-attempt.policy';
import { loadOwnedArtifact } from '../services/load-owned-artifact';

interface SubmitQuizAttemptInput {
  artifactId: string;
  userId: string;
  scope?: QuizAttemptScope;
  answers: QuizAnswer[];
}

const DEFAULT_SCOPE: QuizAttemptScope = QUIZ_ATTEMPT_SCOPE.FULL;

@Injectable()
export class SubmitQuizAttemptHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly readRepo: ArtifactReadRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizAttemptRepo: QuizAttemptRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: SubmitQuizAttemptInput
  ): Promise<Result<QuizAttempt, ArtifactDomainError>> {
    const owned = await loadOwnedArtifact(
      this.readRepo,
      input.artifactId,
      input.userId,
      ARTIFACT_TYPE.QUIZ
    );

    if (owned.isErr()) {
      return err(owned.error);
    }

    const scope = input.scope ?? DEFAULT_SCOPE;
    const { questions } = owned.value.content as QuizContent;

    const validated = validateQuizAnswers(questions, input.answers, scope);
    if (validated.isErr()) {
      return err(validated.error);
    }

    if (scope === QUIZ_ATTEMPT_SCOPE.MISSED) {
      const latestFull = await this.quizAttemptRepo.findLatestFull(
        input.artifactId,
        input.userId
      );
      const missedScope = resolveMissedScope(latestFull, input.answers);
      if (missedScope.isErr()) {
        return err(missedScope.error);
      }
    }

    const { gradedAnswers, score } = gradeQuizAttempt(
      questions,
      input.answers,
      scope
    );

    const createResult = await this.quizAttemptRepo.create({
      artifactId: input.artifactId,
      userId: input.userId,
      score,
      scope,
      answers: gradedAnswers,
    });

    if (createResult.isErr()) {
      return err(createResult.error);
    }

    this.eventEmitter.emit(
      QuizCompletedEvent.EVENT_NAME,
      new QuizCompletedEvent(input.artifactId, input.userId, scope, score)
    );

    return ok(createResult.value);
  }
}
