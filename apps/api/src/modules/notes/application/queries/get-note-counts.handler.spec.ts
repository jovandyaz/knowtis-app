import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteBucketCounts } from '@knowtis/shared-types';

import type { NoteRepository } from '../../domain';
import { GetNoteCountsHandler } from './get-note-counts.handler';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const zeroCounts: NoteBucketCounts = {
  inbox: 0,
  projects: 0,
  areas: 0,
  resources: 0,
  archive: 0,
};

describe('GetNoteCountsHandler', () => {
  let handler: GetNoteCountsHandler;
  let noteRepository: NoteRepository;

  beforeEach(() => {
    noteRepository = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findOwnedSummariesByIds: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      findByIdForUser: vi.fn(),
      findAccessibleSummariesByUser: vi.fn(),
      findAccessibleNotesByLexicalRank: vi.fn(),
      findAccessibleNotesByEmbedding: vi.fn(),
      countAccessibleByUser: vi.fn(),
      countAccessibleByBucket: vi.fn(),
      countAccessibleBySupertag: vi.fn(),
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      restore: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      upsertPermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };
    handler = new GetNoteCountsHandler(noteRepository);
  });

  it('returns the counts grouped by bucket from the repository', async () => {
    const counts: NoteBucketCounts = {
      inbox: 1,
      projects: 2,
      areas: 1,
      resources: 0,
      archive: 0,
    };
    vi.mocked(noteRepository.countAccessibleByBucket).mockResolvedValue(counts);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(counts);
    }
    expect(noteRepository.countAccessibleByBucket).toHaveBeenCalledWith(
      expect.objectContaining({ value: VALID_UUID })
    );
  });

  it('returns all-zero counts when the user has no accessible notes', async () => {
    vi.mocked(noteRepository.countAccessibleByBucket).mockResolvedValue(
      zeroCounts
    );

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result._unsafeUnwrap()).toEqual(zeroCounts);
  });

  it('should fail with empty user id', async () => {
    const result = await handler.execute({ userId: '' });

    expect(result.isErr()).toBe(true);
    expect(noteRepository.countAccessibleByBucket).not.toHaveBeenCalled();
  });
});
