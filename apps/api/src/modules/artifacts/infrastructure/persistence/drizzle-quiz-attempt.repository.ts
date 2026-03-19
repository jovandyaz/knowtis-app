import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { QuizAttempt } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { quizAttempts } from '../../../../database/schema';
import {
  ArtifactErrors,
  type ArtifactDomainError,
  type QuizAttemptRepository,
} from '../../domain';

@Injectable()
export class DrizzleQuizAttemptRepository implements QuizAttemptRepository {
  private readonly logger = new Logger(DrizzleQuizAttemptRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(data: {
    artifactId: string;
    userId: string;
    score: number;
    answers: QuizAttempt['answers'];
  }): Promise<Result<QuizAttempt, ArtifactDomainError>> {
    try {
      const result = await this.db
        .insert(quizAttempts)
        .values({
          artifactId: data.artifactId,
          userId: data.userId,
          score: data.score.toFixed(2),
          answers: data.answers,
        })
        .returning();

      if (!result[0]) {
        this.logger.warn({
          event: 'quiz_attempt.create_failed',
          artifactId: data.artifactId,
          userId: data.userId,
          reason: 'No row returned from insert',
        });
        return err(
          ArtifactErrors.internalError('Failed to create quiz attempt')
        );
      }

      return ok({
        id: result[0].id,
        artifactId: result[0].artifactId,
        score: Number(result[0].score),
        answers: result[0].answers as QuizAttempt['answers'],
        completedAt: result[0].completedAt.toISOString(),
      });
    } catch (error) {
      this.logger.error({
        event: 'quiz_attempt.create_error',
        artifactId: data.artifactId,
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return err(
        ArtifactErrors.internalError(
          error instanceof Error
            ? error.message
            : 'Failed to create quiz attempt'
        )
      );
    }
  }

  async findByArtifact(
    artifactId: string,
    userId: string
  ): Promise<QuizAttempt[]> {
    const rows = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.artifactId, artifactId),
          eq(quizAttempts.userId, userId)
        )
      )
      .orderBy(desc(quizAttempts.completedAt));

    return rows.map((row) => ({
      id: row.id,
      artifactId: row.artifactId,
      score: Number(row.score),
      answers: row.answers as QuizAttempt['answers'],
      completedAt: row.completedAt.toISOString(),
    }));
  }
}
