import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  notePermissions,
  notes,
  type Database,
} from '../../../../database';
import {
  NOTE_EXPOSURE,
  type NoteExposure,
  type NoteExposureRepository,
} from '../../domain/ports/note-exposure.repository';
import { isUuidText } from './uuid-text';

interface NoteOwnership {
  readonly foreign: boolean;
  readonly editableByOthers: boolean;
}

function exposureOf(note: NoteOwnership | undefined): NoteExposure | null {
  if (!note) {
    return NOTE_EXPOSURE.missing;
  }
  if (note.foreign) {
    return NOTE_EXPOSURE.foreign;
  }
  return note.editableByOthers ? NOTE_EXPOSURE.editableByOthers : null;
}

@Injectable()
export class DrizzleNoteExposureRepository implements NoteExposureRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findExposures(
    userId: string,
    noteIds: readonly string[]
  ): Promise<ReadonlyMap<string, NoteExposure>> {
    const requested = [...new Set(noteIds.map((id) => id.toLowerCase()))];
    const found = await this.ownershipOf(userId, requested.filter(isUuidText));
    const exposures = new Map<string, NoteExposure>();
    for (const id of requested) {
      const exposure = exposureOf(found.get(id));
      if (exposure) {
        exposures.set(id, exposure);
      }
    }
    return exposures;
  }

  private async ownershipOf(
    userId: string,
    noteIds: readonly string[]
  ): Promise<ReadonlyMap<string, NoteOwnership>> {
    if (noteIds.length === 0) {
      return new Map();
    }
    const editorElsewhere = this.db
      .select({ noteId: notePermissions.noteId })
      .from(notePermissions)
      .where(
        and(
          eq(notePermissions.noteId, notes.id),
          eq(notePermissions.permission, PERMISSION.EDITOR),
          ne(notePermissions.userId, notes.ownerId)
        )
      );
    const rows = await this.db
      .select({
        id: notes.id,
        foreign: sql<boolean>`${notes.ownerId} <> ${userId}`,
        editableByOthers: sql<boolean>`(${notes.generalAccess} = ${GENERAL_ACCESS.ANYONE_WITH_LINK} AND ${notes.generalAccessPermission} = ${PERMISSION.EDITOR}) OR EXISTS (${editorElsewhere})`,
      })
      .from(notes)
      .where(inArray(notes.id, [...noteIds]));
    return new Map(
      rows.map((row) => [
        row.id.toLowerCase(),
        { foreign: row.foreign, editableByOthers: row.editableByOthers },
      ])
    );
  }
}
