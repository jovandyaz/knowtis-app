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

export type NoteView = Omit<NoteEntity, 'yjsState'>;

export function toNoteView(entity: NoteEntity): NoteView {
  return {
    id: entity.id,
    title: entity.title,
    content: entity.content,
    ownerId: entity.ownerId,
    generalAccess: entity.generalAccess,
    generalAccessPermission: entity.generalAccessPermission,
    shareToken: entity.shareToken,
    editorsCanShare: entity.editorsCanShare,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly generalAccess: string;
  readonly shareToken: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NoteOwner {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
}

export interface NoteViewWithOwner extends NoteView {
  readonly owner: NoteOwner;
}
