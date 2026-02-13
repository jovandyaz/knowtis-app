import type { Ability } from '@jovandyaz/permissions';

import type { PermissionLevel } from '@knowtis/shared-types';

export const actions = [
  'create',
  'read',
  'update',
  'delete',
  'share',
  'manage',
] as const;
export type Action = (typeof actions)[number];

export const SUBJECTS = { Note: 'Note' } as const;

export interface NoteSubject {
  readonly __typename: typeof SUBJECTS.Note;
  readonly id: string;
  readonly ownerId: string;
  readonly isPublic: boolean;
}

export type Subject = NoteSubject | typeof SUBJECTS.Note;

export type AppAbility = Ability<Action, Subject>;

export interface AuthUser {
  readonly id: string;
}

export interface SharedNote {
  readonly noteId: string;
  readonly permission: PermissionLevel;
}

export interface PermissionContext {
  readonly sharedNotes?: readonly SharedNote[];
}
