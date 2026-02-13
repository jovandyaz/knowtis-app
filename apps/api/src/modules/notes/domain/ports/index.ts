import { NoteReadRepository } from './note-read.repository';
import { NoteWriteRepository } from './note-write.repository';
import { PermissionRepository } from './permission.repository';

export * from './note-read.repository';
export * from './note-write.repository';
export * from './permission.repository';

export interface NoteRepository
  extends NoteReadRepository, NoteWriteRepository, PermissionRepository {}

export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');
