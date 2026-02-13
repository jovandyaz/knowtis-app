import type { UserId } from '../../../auth/domain';
import type { NoteEntity, NoteEntityWithOwner } from '../entities';

export interface NoteReadRepository {
  findById(id: string): Promise<NoteEntity | null>;
  findByIdWithOwner(id: string): Promise<NoteEntityWithOwner | null>;
  findByOwner(ownerId: UserId, search?: string): Promise<NoteEntity[]>;
  findAccessibleByUser(
    userId: UserId,
    search?: string
  ): Promise<{ note: NoteEntity; permission?: string }[]>;
}

export const NOTE_READ_REPOSITORY = Symbol('NOTE_READ_REPOSITORY');
