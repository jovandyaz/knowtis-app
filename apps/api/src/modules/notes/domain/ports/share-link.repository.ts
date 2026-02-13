import type { Result } from 'neverthrow';

import type { PermissionLevel } from '@knowtis/shared-types';

import type { ShareLinkEntity } from '../entities';
import type { NoteDomainError } from '../errors';

export interface CreateShareLinkData {
  readonly noteId: string;
  readonly token: string;
  readonly permission: PermissionLevel;
  readonly expiresAt: Date | null;
  readonly createdBy: string;
}

export interface ShareLinkRepository {
  create(
    data: CreateShareLinkData
  ): Promise<Result<ShareLinkEntity, NoteDomainError>>;
  findByToken(token: string): Promise<ShareLinkEntity | null>;
  findByNoteId(noteId: string): Promise<ShareLinkEntity[]>;
  delete(id: string): Promise<Result<void, NoteDomainError>>;
}

export const SHARE_LINK_REPOSITORY = Symbol('SHARE_LINK_REPOSITORY');
