import type { UserId } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

import type { NotePerson, PermissionLevel } from '@knowtis/shared-types';

import type { NotePermissionEntity } from '../entities';
import type { NoteDomainError } from '../errors';

export interface UpsertPermissionData {
  readonly noteId: string;
  readonly userId: UserId;
  readonly permission: string;
  readonly allowAmplification?: boolean;
}

export interface PermissionRepository {
  findPermission(
    noteId: string,
    userId: UserId
  ): Promise<NotePermissionEntity | null>;
  findPeopleByNote(noteId: string): Promise<NotePerson[]>;
  /** Grants or re-grants access in one statement; the latest permission wins. */
  upsertPermission(
    data: UpsertPermissionData
  ): Promise<Result<NotePermissionEntity, NoteDomainError>>;
  deletePermission(
    noteId: string,
    userId: UserId
  ): Promise<Result<boolean, NoteDomainError>>;
  hasAccess(
    noteId: string,
    userId: UserId,
    requiredPermission?: PermissionLevel
  ): Promise<boolean>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
