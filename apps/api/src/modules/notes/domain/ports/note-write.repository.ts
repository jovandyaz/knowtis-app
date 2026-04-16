import type { UserId } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

import type {
  GeneralAccessLevel,
  PermissionLevel,
} from '@knowtis/shared-types';

import type { NoteEntity } from '../entities';
import type { NoteDomainError } from '../errors';

export interface CreateNoteData {
  readonly id?: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: UserId;
}

export interface UpdateNoteData {
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: GeneralAccessLevel;
  readonly generalAccessPermission?: PermissionLevel;
  readonly shareToken?: string | null;
  readonly editorsCanShare?: boolean;
}

export type UpdateNoteContentData = UpdateNoteData & {
  readonly content: string;
};

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
  updateContentWithYjsState(
    id: string,
    data: UpdateNoteContentData,
    yjsState: Buffer
  ): Promise<Result<NoteEntity, NoteDomainError>>;
  delete(id: string): Promise<Result<boolean, NoteDomainError>>;
}

export const NOTE_WRITE_REPOSITORY = Symbol('NOTE_WRITE_REPOSITORY');
