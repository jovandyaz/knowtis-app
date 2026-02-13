import { err, ok, type Result } from 'neverthrow';

import {
  PERMISSION,
  PERMISSION_LEVELS,
  type PermissionLevel as PermissionType,
} from '@knowtis/shared-types';

import { NoteErrors, type NoteDomainError } from '../errors';

export type { PermissionType };

export class PermissionLevel {
  private constructor(public readonly value: PermissionType) {}

  static create(level: string): Result<PermissionLevel, NoteDomainError> {
    if (!PERMISSION_LEVELS.includes(level as PermissionType)) {
      return err(NoteErrors.invalidPermission());
    }

    return ok(new PermissionLevel(level as PermissionType));
  }

  isEditor(): boolean {
    return this.value === PERMISSION.EDITOR;
  }

  toJSON(): PermissionType {
    return this.value;
  }
}
