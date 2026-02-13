import type { PermissionLevel } from '../value-objects';

export interface NotePermissionEntity {
  readonly noteId: string;
  readonly userId: string;
  readonly permission: PermissionLevel;
}

export interface NoteEntity {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly generalAccess: string;
  readonly generalAccessPermission: string;
  readonly shareToken: string | null;
  readonly editorsCanShare: boolean;
  readonly yjsState: Buffer | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NoteOwner {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
}

export interface NoteEntityWithOwner extends NoteEntity {
  readonly owner: NoteOwner;
}
