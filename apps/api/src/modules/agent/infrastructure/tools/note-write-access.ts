import type { Logger } from '@nestjs/common';

import { reasonOf } from '../../../../core/errors/reason-of';
import type {
  NoteExposureRepository,
  NoteWriteAccess,
} from '../../domain/ports/note-exposure.repository';

const WRITE_ACCESS_UNAVAILABLE_EVENT = 'agent.tools.write_access_unavailable';
const NO_WRITE_ACCESS: ReadonlyMap<string, NoteWriteAccess> = new Map();

/** The access a read reports for a note the lookup did not find, or could not look up: editable by someone else, so nothing read from it reaches long-term memory. */
export const UNKNOWN_WRITE_ACCESS: NoteWriteAccess = {
  editableByOthers: true,
  linkPermission: null,
};

/**
 * The write access of `noteIds`, or none when the lookup fails, logged without note content: the record only
 * keeps text out of long-term memory, so a failed lookup never fails the read that asked for it.
 */
export async function findWriteAccessOrNone(
  exposure: NoteExposureRepository,
  userId: string,
  noteIds: readonly string[],
  logger: Pick<Logger, 'warn'>
): Promise<ReadonlyMap<string, NoteWriteAccess>> {
  try {
    return await exposure.findWriteAccess(userId, noteIds);
  } catch (error) {
    logger.warn({
      event: WRITE_ACCESS_UNAVAILABLE_EVENT,
      noteCount: noteIds.length,
      error: reasonOf(error),
    });
    return NO_WRITE_ACCESS;
  }
}

/** Each note with who else could write it when it was read, so the stored tool result keeps that fact after a share is revoked. */
export function withWriteAccess<T extends { readonly id: string }>(
  notes: readonly T[],
  access: ReadonlyMap<string, NoteWriteAccess>
): (T & NoteWriteAccess)[] {
  return notes.map((note) => ({
    ...note,
    ...(access.get(note.id.toLowerCase()) ?? UNKNOWN_WRITE_ACCESS),
  }));
}
