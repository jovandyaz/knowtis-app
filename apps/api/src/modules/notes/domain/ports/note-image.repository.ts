import type { NewNoteImage, NoteImage } from '../../../../database/schema';

export interface NoteImageRepository {
  create(data: NewNoteImage): Promise<NoteImage>;
  findPathnamesByNote(noteId: string): Promise<string[]>;
}

export const NOTE_IMAGE_REPOSITORY = Symbol('NOTE_IMAGE_REPOSITORY');
