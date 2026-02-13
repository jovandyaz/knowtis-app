import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type { PermissionLevel as PermissionLevelType } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  noteShareLinks,
  type Database,
  type NewNoteShareLink,
} from '../../../../database';
import {
  NoteErrors,
  PermissionLevel,
  type CreateShareLinkData,
  type NoteDomainError,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';

@Injectable()
export class DrizzleShareLinkRepository implements ShareLinkRepository {
  private readonly logger = new Logger(DrizzleShareLinkRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(
    data: CreateShareLinkData
  ): Promise<Result<ShareLinkEntity, NoteDomainError>> {
    try {
      const newLink: NewNoteShareLink = {
        noteId: data.noteId,
        token: data.token,
        permission: data.permission as PermissionLevelType,
        expiresAt: data.expiresAt,
        createdBy: data.createdBy,
      };

      const result = await this.db
        .insert(noteShareLinks)
        .values(newLink)
        .returning();

      if (!result[0]) {
        return err(
          NoteErrors.persistenceError('create share link', data.noteId)
        );
      }

      return ok(this.mapToEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to create share link for note ${data.noteId}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('create share link', data.noteId));
    }
  }

  async findByToken(token: string): Promise<ShareLinkEntity | null> {
    const result = await this.db
      .select()
      .from(noteShareLinks)
      .where(eq(noteShareLinks.token, token))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  async findByNoteId(noteId: string): Promise<ShareLinkEntity[]> {
    const results = await this.db
      .select()
      .from(noteShareLinks)
      .where(eq(noteShareLinks.noteId, noteId));

    return results.map((row) => this.mapToEntity(row));
  }

  async delete(id: string): Promise<Result<void, NoteDomainError>> {
    try {
      const result = await this.db
        .delete(noteShareLinks)
        .where(eq(noteShareLinks.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.shareLinkNotFound(id));
      }

      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to delete share link ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('delete share link', id));
    }
  }

  private mapToEntity(
    record: typeof noteShareLinks.$inferSelect
  ): ShareLinkEntity {
    const permissionResult = PermissionLevel.create(record.permission);
    return {
      id: record.id,
      noteId: record.noteId,
      token: record.token,
      permission: permissionResult.isOk()
        ? permissionResult.value
        : PermissionLevel.create('viewer')._unsafeUnwrap(),
      expiresAt: record.expiresAt,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
    };
  }
}
