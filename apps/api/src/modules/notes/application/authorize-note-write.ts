import { UserId } from '@jovandyaz/auth/server';
import { err, ok, type Result } from 'neverthrow';

import type { NoteEntity } from '../domain/entities/note.entity';
import { NoteErrors, type NoteDomainError } from '../domain/errors/note.errors';
import type { NoteReadRepository } from '../domain/ports/note-read.repository';
import type { PermissionRepository } from '../domain/ports/permission.repository';

/** Finds the note when `userId` owns it or has editor access to it. */
export async function authorizeNoteWrite(
  noteRepository: NoteReadRepository,
  permissionRepository: PermissionRepository,
  noteId: string,
  userId: string
): Promise<Result<NoteEntity, NoteDomainError>> {
  const note = await noteRepository.findById(noteId);
  if (!note) {
    return err(NoteErrors.noteNotFound(noteId));
  }
  const canWrite =
    note.ownerId === userId ||
    (await permissionRepository.hasAccess(
      noteId,
      UserId.fromTrusted(userId),
      'editor'
    ));
  return canWrite
    ? ok(note)
    : err(NoteErrors.permissionDenied('No write access to this note'));
}
