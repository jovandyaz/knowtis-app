import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  DrizzleQueryError,
  eq,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  DATABASE_CONNECTION,
  notes,
  type Database,
  type NewNote,
} from '../../../../database';
import {
  NoteErrors,
  type CreateNoteData,
  type NoteDomainError,
  type NoteEntity,
  type NoteWriteRepository,
  type UpdateNoteContentData,
  type UpdateNoteData,
} from '../../domain';
import type { RotateShareTokenData } from '../../domain/ports/note-write.repository';
import { mapToNoteEntity } from './note-entity.mapper';

function rotationFailureCategory(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  switch (code) {
    case '23505':
      return 'unique_violation';
    case '08006':
    case 'ECONNREFUSED':
      return 'connection_failure';
    case '55P03':
      return 'transaction_conflict';
    default:
      return 'unclassified';
  }
}

type NoteUpdatePayload = Omit<Partial<NewNote>, 'shareToken'> & {
  shareToken?: string | null | SQL | undefined;
};

function buildUpdatePayload(
  data: UpdateNoteData,
  extras: Partial<NewNote> = {}
): NoteUpdatePayload {
  const payload: NoteUpdatePayload = { updatedAt: new Date(), ...extras };

  if (data.title !== undefined) {
    payload.title = data.title;
  }
  if (data.content !== undefined) {
    payload.content = data.content;
  }
  if (data.generalAccess !== undefined) {
    payload.generalAccess = data.generalAccess;
  }
  if (data.generalAccessPermission !== undefined) {
    payload.generalAccessPermission = data.generalAccessPermission;
  }
  if (data.shareToken !== undefined) {
    payload.shareToken = sql`coalesce(${notes.shareToken}, ${data.shareToken})`;
  }
  if (data.editorsCanShare !== undefined) {
    payload.editorsCanShare = data.editorsCanShare;
  }
  if (data.bucket !== undefined) {
    payload.bucket = data.bucket;
  }

  return payload;
}

@Injectable()
export class DrizzleNoteWriteRepository implements NoteWriteRepository {
  private readonly logger = new Logger(DrizzleNoteWriteRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(
    data: CreateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.insertNote(data);
  }

  async createWithYjsState(
    data: CreateNoteData,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.insertNote(data, { yjsState });
  }

  private async insertNote(
    data: CreateNoteData,
    extras: Partial<NewNote> = {}
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const newNote: NewNote = {
        ...(data.id ? { id: data.id } : {}),
        title: data.title,
        content: data.content,
        ownerId: data.ownerId.value,
        ...extras,
      };

      const result = await this.db.insert(notes).values(newNote).returning();
      if (!result[0]) {
        return err(NoteErrors.noteNotFound('Failed to create'));
      }

      return ok(mapToNoteEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to create note`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('create', data.id ?? 'unknown'));
    }
  }

  async rotateShareToken(
    data: RotateShareTokenData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const [record] = await this.db
        .update(notes)
        .set({ shareToken: data.newToken, updatedAt: new Date() })
        .where(
          and(
            eq(notes.id, data.noteId),
            eq(notes.ownerId, data.ownerId),
            eq(notes.shareToken, data.expectedToken),
            isNull(notes.deletedAt)
          )
        )
        .returning();
      return record
        ? ok(mapToNoteEntity(record))
        : err(NoteErrors.shareLinkConflict());
    } catch (error) {
      this.logger.error({
        operation: 'rotateShareToken',
        noteId: data.noteId,
        failureCategory: rotationFailureCategory(error),
      });
      return err(NoteErrors.persistenceError('rotateShareToken', data.noteId));
    }
  }

  async update(
    id: string,
    data: UpdateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const result = await this.db
        .update(notes)
        .set(buildUpdatePayload(data))
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(mapToNoteEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to update note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('update', id));
    }
  }

  async updateYjsState(
    id: string,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const result = await this.db
        .update(notes)
        .set({ yjsState, updatedAt: new Date() })
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(mapToNoteEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to update Yjs state for note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('updateYjsState', id));
    }
  }

  async updateContentWithYjsState(
    id: string,
    data: UpdateNoteContentData,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const payload = buildUpdatePayload(data, { yjsState });

      return await this.db.transaction(async (tx) => {
        const result = await tx
          .update(notes)
          .set(payload)
          .where(eq(notes.id, id))
          .returning();

        if (!result[0]) {
          return err(NoteErrors.noteNotFound(id));
        }
        return ok(mapToNoteEntity(result[0]));
      });
    } catch (error) {
      this.logger.error(
        `Failed atomic content+yjsState update for note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('updateContentWithYjsState', id));
    }
  }

  async delete(id: string): Promise<Result<boolean, NoteDomainError>> {
    try {
      const result = await this.db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(true);
    } catch (error) {
      this.logger.error(
        `Failed to delete note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('delete', id));
    }
  }

  async restore(
    id: string,
    ownerId: string
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const result = await this.db
        .update(notes)
        .set({ deletedAt: null })
        .where(
          and(
            eq(notes.id, id),
            eq(notes.ownerId, ownerId),
            isNotNull(notes.deletedAt)
          )
        )
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(mapToNoteEntity(result[0]));
    } catch (error) {
      this.logger.error(
        `Failed to restore note ${id}`,
        error instanceof Error ? error.stack : error
      );
      return err(NoteErrors.persistenceError('restore', id));
    }
  }
}
