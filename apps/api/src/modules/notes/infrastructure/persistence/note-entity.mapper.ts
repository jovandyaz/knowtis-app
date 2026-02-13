import type { notes } from '../../../../database';
import type { NoteEntity } from '../../domain';

export function mapToNoteEntity(record: typeof notes.$inferSelect): NoteEntity {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    ownerId: record.ownerId,
    generalAccess: record.generalAccess,
    generalAccessPermission: record.generalAccessPermission,
    shareToken: record.shareToken,
    editorsCanShare: record.editorsCanShare,
    yjsState: record.yjsState as Buffer | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
