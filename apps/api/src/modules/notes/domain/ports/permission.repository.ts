import type { Result } from 'neverthrow';

import type { PermissionLevel } from '@knowtis/shared-types';

import type { UserId } from '../../../auth/domain/value-objects/user-id.vo';
import type { NotePermissionEntity } from '../entities';
import type { NoteDomainError } from '../errors';

export interface CreatePermissionData {
  readonly noteId: string;
  readonly userId: UserId;
  readonly permission: string;
}

export interface PermissionRepository {
  findPermission(
    noteId: string,
    userId: UserId
  ): Promise<NotePermissionEntity | null>;
  findPermissionsByNote(noteId: string): Promise<
    {
      permission: NotePermissionEntity;
      user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
      };
    }[]
  >;
  createPermission(
    data: CreatePermissionData
  ): Promise<Result<NotePermissionEntity, NoteDomainError>>;
  updatePermission(
    noteId: string,
    userId: UserId,
    permission: string
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
