import type { PermissionLevel } from '../value-objects';

export interface ShareLinkEntity {
  readonly id: string;
  readonly noteId: string;
  readonly token: string;
  readonly permission: PermissionLevel;
  readonly expiresAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}
