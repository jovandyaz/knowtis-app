import type { UserId } from '@jovandyaz/auth';
import type { Result } from 'neverthrow';

import type { NoteEntity } from '../entities';
import type { NoteDomainError } from '../errors';

export interface CreateNoteData {
  readonly title: string;
  readonly content: string;
  readonly ownerId: UserId;
}

export interface UpdateNoteData {
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: string;
  readonly generalAccessPermission?: string;
  readonly shareToken?: string | null;
  readonly editorsCanShare?: boolean;
}

export interface NoteWriteRepository {
  create(data: CreateNoteData): Promise<Result<NoteEntity, NoteDomainError>>;
  update(
    id: string,
    data: UpdateNoteData
  ): Promise<Result<NoteEntity, NoteDomainError>>;
  updateYjsState(
    id: string,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>>;
  delete(id: string): Promise<Result<boolean, NoteDomainError>>;
}

export const NOTE_WRITE_REPOSITORY = Symbol('NOTE_WRITE_REPOSITORY');
