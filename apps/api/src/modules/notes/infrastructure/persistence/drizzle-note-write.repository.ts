import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import { databaseDiagnostics } from '../../../../core/errors/database-diagnostics';
import { stackOf } from '../../../../core/errors/stack-of';
import {
  DATABASE_CONNECTION,
  notes,
  users,
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
import type {
  NoteAdmission,
  RotateShareTokenData,
} from '../../domain/ports/note-write.repository';
import { mapToNoteEntity } from './note-entity.mapper';

type NoteWriter = Pick<Database, 'insert' | 'update'>;

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
    data: CreateNoteData,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.insertNote(data, {}, admission);
  }

  async createWithYjsState(
    data: CreateNoteData,
    yjsState: Buffer,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.insertNote(data, { yjsState }, admission);
  }

  private async insertNote(
    data: CreateNoteData,
    extras: Partial<NewNote>,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      const newNote: NewNote = {
        ...(data.id ? { id: data.id } : {}),
        title: data.title,
        content: data.content,
        ownerId: data.ownerId.value,
        ...extras,
      };

      return await this.writeAdmitted(
        newNote.ownerId,
        admission,
        async (db) => {
          const [record] = await db.insert(notes).values(newNote).returning();
          return record
            ? ok(mapToNoteEntity(record))
            : err(NoteErrors.noteNotFound('Failed to create'));
        }
      );
    } catch (error) {
      this.logger.error(`Failed to create note`, stackOf(error));
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
        ...databaseDiagnostics(error),
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
      this.logger.error(`Failed to update note ${id}`, stackOf(error));
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
        stackOf(error)
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
        stackOf(error)
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
      this.logger.error(`Failed to delete note ${id}`, stackOf(error));
      return err(NoteErrors.persistenceError('delete', id));
    }
  }

  async restore(
    id: string,
    ownerId: string,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    try {
      return await this.writeAdmitted(ownerId, admission, async (db) => {
        const [record] = await db
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
        return record
          ? ok(mapToNoteEntity(record))
          : err(NoteErrors.noteNotFound(id));
      });
    } catch (error) {
      this.logger.error(`Failed to restore note ${id}`, stackOf(error));
      return err(NoteErrors.persistenceError('restore', id));
    }
  }

  private async writeAdmitted(
    ownerId: string,
    { anonymousNoteCap }: NoteAdmission,
    write: (db: NoteWriter) => Promise<Result<NoteEntity, NoteDomainError>>
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    if (anonymousNoteCap === undefined) {
      return write(this.db);
    }
    return this.db.transaction(async (tx) => {
      // Locking the owner row runs one owner's capped writes one at a time, so
      // each count already includes the note the previous write committed.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, ownerId))
        .for('no key update');
      const [owned] = await tx
        .select({ value: count() })
        .from(notes)
        .where(and(eq(notes.ownerId, ownerId), isNull(notes.deletedAt)));
      if ((owned?.value ?? 0) >= anonymousNoteCap) {
        return err(NoteErrors.anonymousNoteLimit(anonymousNoteCap));
      }
      return write(tx);
    });
  }
}
