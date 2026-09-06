import type { UserId } from '@jovandyaz/auth/server';

import type { TagColor, TagNode } from '@knowtis/shared-types';

import type { TagPath } from '../value-objects/tag-path.vo';

export interface TagRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly path: string;
  readonly color: TagColor | null;
}

export interface TagRepository {
  /** The user's whole vocabulary, counted over the notes they can access. */
  findTreeByOwner(userId: UserId): Promise<TagNode[]>;
  findById(tagId: string): Promise<TagRecord | null>;
  /** Creates any missing ancestor rows and returns the id of each requested leaf path. */
  ensurePaths(ownerId: UserId, paths: TagPath[]): Promise<string[]>;
  replaceNoteTags(noteId: string, tagIds: string[]): Promise<void>;
  findPathsByNotes(noteIds: string[]): Promise<Map<string, string[]>>;
  /**
   * The first path the owner already holds that a rename onto `nextPath` would
   * claim, ignoring the branch being renamed. Null when the rename is free.
   */
  findPathCollision(tag: TagRecord, nextPath: TagPath): Promise<string | null>;
  /** Rewrites the branch's paths by prefix; `note_tags` rows are untouched. */
  renameBranch(tag: TagRecord, nextPath: TagPath): Promise<void>;
  recolor(tagId: string, color: TagColor | null): Promise<void>;
  deleteBranch(tag: TagRecord): Promise<void>;
}

export const TAG_REPOSITORY = Symbol('TAG_REPOSITORY');
