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

import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../../domain/errors/artifact.errors';
import { QuizCompletedEvent } from '../../domain/events/quiz-completed.event';
import {
  ARTIFACT_READ_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import { loadOwnedArtifact } from '../services/load-owned-artifact';
import { missedQuestionIndexes } from '../services/missed-question-indexes';

interface QuizAnswer {
  questionIndex: number;
  selectedIndex: number;
}

interface SubmitQuizAttemptInput {
  artifactId: string;
  userId: string;
  scope?: QuizAttemptScope;
  answers: QuizAnswer[];
}

const DEFAULT_SCOPE: QuizAttemptScope = QUIZ_ATTEMPT_SCOPE.FULL;

function sameIndexSet(a: readonly number[], b: readonly number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return (
    left.size === right.size && [...left].every((index) => right.has(index))
  );
}

function firstInvalidAnswer(
  answers: readonly QuizAnswer[],
  questions: QuizContent['questions']
): string | null {
  const answered = new Set<number>();
  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    if (!question) {
      return `question ${answer.questionIndex} is not part of this quiz`;
    }
    if (answered.has(answer.questionIndex)) {
      return `question ${answer.questionIndex} is answered more than once`;
    }
    answered.add(answer.questionIndex);
    if (answer.selectedIndex >= question.options.length) {
      return `option ${answer.selectedIndex} is not offered for question ${answer.questionIndex}`;
    }
  }
  return null;
}

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
    const quizContent = owned.value.content as QuizContent;

    const invalidAnswer = firstInvalidAnswer(
      input.answers,
      quizContent.questions
    );
    if (invalidAnswer) {
      return err(ArtifactErrors.invalidQuizAnswer(invalidAnswer));
    }

    if (scope === QUIZ_ATTEMPT_SCOPE.MISSED) {
      const latestFull = await this.quizAttemptRepo.findLatestFull(
        input.artifactId,
        input.userId
      );
      if (!latestFull) {
        return err(
          ArtifactErrors.invalidQuizScope('no full attempt to remediate')
        );
      }
      const missed = missedQuestionIndexes(latestFull.answers);
      if (missed.length === 0) {
        return err(ArtifactErrors.invalidQuizScope('nothing to remediate'));
      }
      const answered = input.answers.map((answer) => answer.questionIndex);
      if (!sameIndexSet(answered, missed)) {
        return err(
          ArtifactErrors.invalidQuizScope(
            'answers must cover exactly the missed questions of the latest full attempt'
          )
        );
      }
    }

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
    const denominator =
      scope === QUIZ_ATTEMPT_SCOPE.FULL
        ? quizContent.questions.length
        : gradedAnswers.length;
    const score = denominator > 0 ? correctCount / denominator : 0;

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
