import type { AccessSnapshot } from '../access-policy';

export interface AccessSnapshotRepository {
  findAccessSnapshot(noteId: string): Promise<AccessSnapshot | null>;
}
export const ACCESS_SNAPSHOT_REPOSITORY = Symbol('ACCESS_SNAPSHOT_REPOSITORY');
