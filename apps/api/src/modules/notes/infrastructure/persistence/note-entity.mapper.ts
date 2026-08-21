import type { notes } from '../../../../database';
import type { NoteEntity, NoteView } from '../../domain';

type NoteViewRecord = Omit<typeof notes.$inferSelect, 'yjsState' | 'deletedAt'>;

export function mapToNoteEntity(record: typeof notes.$inferSelect): NoteEntity {
  return {
    ...mapToNoteView(record),
    yjsState: record.yjsState as Buffer | null,
  };
}

export function mapToNoteView(record: NoteViewRecord): NoteView {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    ownerId: record.ownerId,
    generalAccess: record.generalAccess,
    generalAccessPermission: record.generalAccessPermission,
    shareToken: record.shareToken,
    editorsCanShare: record.editorsCanShare,
    bucket: record.bucket,
    supertag: record.supertag,
    supertagFields: record.supertagFields,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
