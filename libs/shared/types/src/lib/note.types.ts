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

export interface Note {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  isPublic: boolean;
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
  title: string;
  content?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  isPublic?: boolean;
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

export interface NoteShareLink {
  id: string;
  noteId: string;
  token: string;
  permission: PermissionLevel;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateShareLinkInput {
  permission: PermissionLevel;
  expiresAt?: Date;
}
