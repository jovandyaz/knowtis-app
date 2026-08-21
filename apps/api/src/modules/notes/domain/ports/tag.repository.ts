import type { UserId } from '@jovandyaz/auth/server';

import type { TagNode } from '@knowtis/shared-types';

import type { TagPath } from '../value-objects/tag-path.vo';

export interface TagRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly path: string;
  readonly color: string | null;
}

export interface TagRepository {
  /** The user's whole vocabulary, counted over the notes they can access. */
  findTreeByOwner(userId: UserId): Promise<TagNode[]>;
  findById(tagId: string): Promise<TagRecord | null>;
  /** Creates any missing ancestor rows and returns the id of each requested leaf path. */
  ensurePaths(ownerId: UserId, paths: TagPath[]): Promise<string[]>;
  replaceNoteTags(noteId: string, tagIds: string[]): Promise<void>;
  findPathsByNotes(noteIds: string[]): Promise<Map<string, string[]>>;
  /** Rewrites the branch's paths by prefix; `note_tags` rows are untouched. */
  renameBranch(tag: TagRecord, nextPath: TagPath): Promise<void>;
  recolor(tagId: string, color: string | null): Promise<void>;
  deleteBranch(tag: TagRecord): Promise<void>;
}

export const TAG_REPOSITORY = Symbol('TAG_REPOSITORY');
