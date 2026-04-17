import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import type { NoteEntity, NoteRepository } from '../notes/domain';
import { CollaborationService } from './collaboration.service';
import type { CollaborationRoom } from './collaboration.types';

function makeRoom(noteId: string, yjsDoc: Y.Doc): CollaborationRoom {
  return {
    noteId,
    yjsDoc,
    users: new Map(),
    lastActivity: new Date(),
  };
}

function makeNoteEntity(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: '',
    ownerId: 'owner-1',
    generalAccess: 'restricted',
    generalAccessPermission: 'viewer',
    shareToken: null,
    editorsCanShare: false,
    yjsState: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<Record<keyof NoteRepository, unknown>> = {}
): NoteRepository {
  return {
    findById: vi.fn(),
    findByIdWithOwner: vi.fn(),
    findByOwner: vi.fn(),
    findAccessibleByUser: vi.fn(),
    findByShareToken: vi.fn(),
    create: vi.fn(),
    createWithYjsState: vi.fn(),
    update: vi.fn(),
    updateYjsState: vi.fn().mockResolvedValue(ok(makeNoteEntity())),
    updateContentWithYjsState: vi.fn(),
    delete: vi.fn(),
    findPermission: vi.fn(),
    findPermissionsByNote: vi.fn(),
    createPermission: vi.fn(),
    updatePermission: vi.fn(),
    deletePermission: vi.fn(),
    hasAccess: vi.fn(),
    ...overrides,
  } as unknown as NoteRepository;
}

describe('CollaborationService.persistDocument', () => {
  it('skips persistence when Y.Doc is trivial but stored note has non-trivial content', async () => {
    const repo = makeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(
          makeNoteEntity({ content: '<h1>Real content</h1>' })
        ),
    });
    const service = new CollaborationService(repo);

    const yjsDoc = new Y.Doc();
    const room = makeRoom('note-1', yjsDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).not.toHaveBeenCalled();
  });

  it('persists when Y.Doc has real content', async () => {
    const repo = makeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(makeNoteEntity({ content: '<p>old</p>' })),
    });
    const service = new CollaborationService(repo);

    const yjsDoc = new Y.Doc();
    const fragment = yjsDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('hello')]);
    fragment.insert(0, [paragraph]);

    const room = makeRoom('note-1', yjsDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).toHaveBeenCalledTimes(1);
    expect(repo.updateYjsState).toHaveBeenCalledWith(
      'note-1',
      expect.any(Buffer)
    );
  });

  it('persists trivial state when stored content is also trivial (no guard needed)', async () => {
    const repo = makeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(makeNoteEntity({ content: '<p></p>' })),
    });
    const service = new CollaborationService(repo);

    const yjsDoc = new Y.Doc();
    const room = makeRoom('note-1', yjsDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).toHaveBeenCalledTimes(1);
  });

  it('persists trivial state when findById throws (fail-open; do not block writes on a read error)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const service = new CollaborationService(repo);

    const yjsDoc = new Y.Doc();
    const room = makeRoom('note-1', yjsDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).toHaveBeenCalledTimes(1);
  });

  it('persists trivial state when stored note was deleted (findById returns null)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(null),
    });
    const service = new CollaborationService(repo);

    const yjsDoc = new Y.Doc();
    const room = makeRoom('note-deleted', yjsDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).toHaveBeenCalledTimes(1);
  });
});
