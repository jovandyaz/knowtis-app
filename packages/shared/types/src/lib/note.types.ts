import type { ParaBucket } from './organization.types';

export const NOTE_TITLE_MAX_LENGTH = 200;

export const PERMISSION = {
  VIEWER: 'viewer',
  EDITOR: 'editor',
} as const;

export const ACCESS = {
  OWNER: 'owner',
  ...PERMISSION,
} as const;

export const PERMISSION_LEVELS = [
  PERMISSION.VIEWER,
  PERMISSION.EDITOR,
] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export const ACCESS_LEVELS = [ACCESS.OWNER, ...PERMISSION_LEVELS] as const;
export type NoteAccessLevel = (typeof ACCESS_LEVELS)[number];

export const GENERAL_ACCESS = {
  RESTRICTED: 'restricted',
  ANYONE_WITH_LINK: 'anyone_with_link',
} as const;

export const GENERAL_ACCESS_LEVELS = [
  GENERAL_ACCESS.RESTRICTED,
  GENERAL_ACCESS.ANYONE_WITH_LINK,
] as const;
export type GeneralAccessLevel = (typeof GENERAL_ACCESS_LEVELS)[number];

export interface Note {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  generalAccess: GeneralAccessLevel;
  generalAccessPermission: PermissionLevel;
  shareToken: string | null;
  editorsCanShare: boolean;
  bucket: ParaBucket | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteWithOwner extends Note {
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface CreateNoteInput {
  id?: string;
  title: string;
  content?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  generalAccess?: GeneralAccessLevel;
  generalAccessPermission?: PermissionLevel;
  editorsCanShare?: boolean;
  bucket?: ParaBucket | null;
  /** The note's complete tag set as paths; a partial patch would lose updates between tabs. */
  tags?: string[];
}

export interface NotePermission {
  id: string;
  noteId: string;
  userId: string;
  permission: PermissionLevel;
  createdAt: Date;
}

export interface ShareNoteInput {
  userId: string;
  permission: PermissionLevel;
}
