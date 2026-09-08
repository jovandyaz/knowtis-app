import { UserId } from '@jovandyaz/auth/server';
import { err, ok, type Result } from 'neverthrow';

import { canManagePeople } from '../domain/access-policy';
import type { NoteEntity } from '../domain/entities/note.entity';
import { NoteErrors, type NoteDomainError } from '../domain/errors/note.errors';
import type { NoteRepository } from '../domain/ports';

export async function authorizePeople(
  repository: NoteRepository,
  noteId: string,
  actorId: string
): Promise<Result<NoteEntity, NoteDomainError>> {
  const note = await repository.findById(noteId);
  if (!note) {
    return err(NoteErrors.noteNotFound(noteId));
  }
  if (canManagePeople(note, actorId, null)) {
    return ok(note);
  }
  const userId = UserId.create(actorId);
  if (userId.isErr()) {
    return err(NoteErrors.permissionDenied());
  }
  const direct = await repository.findPermission(noteId, userId.value);
  return canManagePeople(note, actorId, direct?.permission.value ?? null)
    ? ok(note)
    : err(NoteErrors.permissionDenied());
}
