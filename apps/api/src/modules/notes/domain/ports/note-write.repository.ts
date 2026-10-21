import type { UserId } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

import type {
  GeneralAccessLevel,
  ParaBucket,
  PermissionLevel,
  Supertag,
  SupertagFields,
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
  /** First-mint only: a delayed write must never clobber a committed rotation. */
  readonly shareToken?: string;
  readonly editorsCanShare?: boolean;
  readonly bucket?: ParaBucket | null;
  readonly supertag?: Supertag | null;
  readonly supertagFields?: SupertagFields | null;
}

export type UpdateNoteContentData = UpdateNoteData & {
  readonly content: string;
};

/** The rule a write that adds an active note to its owner must enforce. */
export interface NoteAdmission {
  /** Refuse with `ANONYMOUS_NOTE_LIMIT` once the owner holds this many active notes, checked atomically with the write so concurrent writes cannot overshoot it. Absent: uncapped. */
  readonly anonymousNoteCap?: number;
}

export interface RotateShareTokenData {
  readonly noteId: string;
  readonly ownerId: string;
  readonly expectedToken: string;
  readonly newToken: string;
}

export interface NoteWriteRepository {
  rotateShareToken(
    data: RotateShareTokenData
  ): Promise<Result<NoteEntity, NoteDomainError>>;
  create(
    data: CreateNoteData,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>>;
  createWithYjsState(
    data: CreateNoteData,
    yjsState: Buffer,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>>;
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
  restore(
    id: string,
    ownerId: string,
    admission: NoteAdmission
  ): Promise<Result<NoteEntity, NoteDomainError>>;
}

export const NOTE_WRITE_REPOSITORY = Symbol('NOTE_WRITE_REPOSITORY');
