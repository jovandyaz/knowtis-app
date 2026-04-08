import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { ArtifactContent, ArtifactType } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { artifacts } from '../../../../database/schema';
import {
  ArtifactErrors,
  type ArtifactDomainError,
  type ArtifactEntity,
  type ArtifactReadRepository,
  type ArtifactWriteRepository,
  type CreateArtifactData,
} from '../../domain';

@Injectable()
export class DrizzleArtifactRepository
  implements ArtifactReadRepository, ArtifactWriteRepository
{
  private readonly logger = new Logger(DrizzleArtifactRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findById(id: string): Promise<ArtifactEntity | null> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);

    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByNoteId(
    noteId: string,
    userId: string
  ): Promise<ArtifactEntity[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(
        and(eq(artifacts.sourceNoteId, noteId), eq(artifacts.userId, userId))
      )
      .orderBy(desc(artifacts.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  async findBySourceNoteId(noteId: string): Promise<ArtifactEntity[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.sourceNoteId, noteId))
      .orderBy(desc(artifacts.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  async findByUserId(userId: string): Promise<ArtifactEntity[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.userId, userId))
      .orderBy(desc(artifacts.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  async create(
    data: CreateArtifactData
  ): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
    try {
      const result = await this.db
        .insert(artifacts)
        .values({
          type: data.type,
          userId: data.userId,
          sourceNoteId: data.sourceNoteId,
          title: data.title,
          content: data.content,
        })
        .returning();

      if (!result[0]) {
        return err(ArtifactErrors.internalError('Failed to create artifact'));
      }

      return ok(this.toEntity(result[0]));
    } catch (error) {
      this.logger.error(
        'Failed to create artifact',
        error instanceof Error ? error.stack : error
      );
      return err(
        ArtifactErrors.internalError(
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async delete(
    id: string,
    userId: string
  ): Promise<Result<boolean, ArtifactDomainError>> {
    try {
      const result = await this.db
        .delete(artifacts)
        .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)))
        .returning();

      if (!result[0]) {
        return err(ArtifactErrors.notFound(id));
      }

      return ok(true);
    } catch (error) {
      this.logger.error(
        `Failed to delete artifact ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(
        ArtifactErrors.internalError(
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  private toEntity(row: typeof artifacts.$inferSelect): ArtifactEntity {
    return {
      id: row.id,
      type: row.type as ArtifactType,
      userId: row.userId,
      sourceNoteId: row.sourceNoteId,
      title: row.title,
      content: row.content as ArtifactContent,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
