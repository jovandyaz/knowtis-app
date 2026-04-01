import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import type {
  GeneralAccessLevel,
  PermissionLevel as PermissionLevelType,
} from '@knowtis/shared-types';

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
  type UpdateNoteData,
} from '../../domain';
import { mapToNoteEntity } from './note-entity.mapper';

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
    try {
      const newNote: NewNote = {
        ...(data.id ? { id: data.id } : {}),
        title: data.title,
        content: data.content,
        ownerId: data.ownerId.value,
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
      const updateData: Partial<NewNote> = { updatedAt: new Date() };

      if (data.title !== undefined) {
        updateData.title = data.title;
      }
      if (data.content !== undefined) {
        updateData.content = data.content;
      }
      if (data.generalAccess !== undefined) {
        updateData.generalAccess = data.generalAccess as GeneralAccessLevel;
      }
      if (data.generalAccessPermission !== undefined) {
        updateData.generalAccessPermission =
          data.generalAccessPermission as PermissionLevelType;
      }
      if (data.shareToken !== undefined) {
        updateData.shareToken = data.shareToken;
      }
      if (data.editorsCanShare !== undefined) {
        updateData.editorsCanShare = data.editorsCanShare;
      }

      const result = await this.db
        .update(notes)
        .set(updateData)
        .where(eq(notes.id, id))
        .returning();

      if (!result[0]) {
        return err(NoteErrors.noteNotFound(id));
      }
      return ok(mapToNoteEntity(result[0]));
    } catch (e) {
      return err(
        NoteErrors.invalidContent(
          e instanceof Error ? e.message : 'Unknown error'
        )
      );
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
