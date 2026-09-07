import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttempt,
  type QuizAttemptScope,
} from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { quizAttempts } from '../../../../database/schema';
import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../../domain/errors/artifact.errors';
import type { QuizAttemptRepository } from '../../domain/ports/artifact.repository';

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
    scope: QuizAttemptScope;
    answers: QuizAttempt['answers'];
  }): Promise<Result<QuizAttempt, ArtifactDomainError>> {
    try {
      const result = await this.db
        .insert(quizAttempts)
        .values({
          artifactId: data.artifactId,
          userId: data.userId,
          score: data.score.toFixed(2),
          scope: data.scope,
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

      return ok(this.toAttempt(result[0]));
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

    return rows.map((row) => this.toAttempt(row));
  }

  async findLatestFull(
    artifactId: string,
    userId: string
  ): Promise<QuizAttempt | null> {
    const rows = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.artifactId, artifactId),
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.scope, QUIZ_ATTEMPT_SCOPE.FULL)
        )
      )
      .orderBy(desc(quizAttempts.completedAt))
      .limit(1);

    return rows[0] ? this.toAttempt(rows[0]) : null;
  }

  async findLatestFullByArtifacts(
    artifactIds: string[],
    userId: string
  ): Promise<QuizAttempt[]> {
    if (artifactIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectDistinctOn([quizAttempts.artifactId])
      .from(quizAttempts)
      .where(
        and(
          inArray(quizAttempts.artifactId, artifactIds),
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.scope, QUIZ_ATTEMPT_SCOPE.FULL)
        )
      )
      .orderBy(quizAttempts.artifactId, desc(quizAttempts.completedAt));

    return rows.map((row) => this.toAttempt(row));
  }

  private toAttempt(row: typeof quizAttempts.$inferSelect): QuizAttempt {
    return {
      id: row.id,
      artifactId: row.artifactId,
      score: Number(row.score),
      scope: row.scope,
      answers: row.answers as QuizAttempt['answers'],
      completedAt: row.completedAt.toISOString(),
    };
  }
}
