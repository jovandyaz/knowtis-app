import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
import { mapToNoteEntity } from './note-entity.mapper';

function buildUpdatePayload(
  data: UpdateNoteData,
  extras: Partial<NewNote> = {}
): Partial<NewNote> {
  const payload: Partial<NewNote> = { updatedAt: new Date(), ...extras };

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
    payload.shareToken = data.shareToken;
  }
  if (data.editorsCanShare !== undefined) {
    payload.editorsCanShare = data.editorsCanShare;
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
        .delete(notes)
        .where(eq(notes.id, id))
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
}
