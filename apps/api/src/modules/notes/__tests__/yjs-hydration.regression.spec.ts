import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { CollaborationService } from '../../../modules/collaboration/collaboration.service';
import type { CollaborationRoom } from '../../../modules/collaboration/collaboration.types';
import type { NoteEntity, NoteRepository } from '../domain';
import { htmlToYjsState } from '../infrastructure/html-to-yjs';

const RICH_HTML =
  '<h1>Survive this</h1><p>The quick <strong>brown</strong> fox jumps.</p>';

function makeRoom(noteId: string, yjsDoc: Y.Doc): CollaborationRoom {
  return { noteId, yjsDoc, users: new Map(), lastActivity: new Date() };
}

function makeNoteEntity(content: string, yjsState: Buffer | null): NoteEntity {
  return {
    id: 'note-1',
    title: 'Regression',
    content,
    ownerId: 'owner-1',
    generalAccess: 'restricted',
    generalAccessPermission: 'viewer',
    shareToken: null,
    editorsCanShare: false,
    yjsState,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    update: vi.fn(),
    updateYjsState: vi.fn().mockResolvedValue(ok(makeNoteEntity('', null))),
    updateContentWithYjsState: vi.fn(),
    createWithYjsState: vi.fn(),
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

describe('Yjs hydration regression', () => {
  it('htmlToYjsState produces a non-trivial state that survives a Y.Doc round-trip', () => {
    const state = htmlToYjsState(RICH_HTML);

    expect(Buffer.isBuffer(state)).toBe(true);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);

    expect(fragment.length).toBeGreaterThan(0);
    expect(fragment.toString()).toContain('Survive this');
    expect(fragment.toString()).toContain('brown');

    doc.destroy();
  });

  it('persistDocument refuses to overwrite non-trivial stored content with a trivial live Y.Doc', async () => {
    const storedState = htmlToYjsState(RICH_HTML);
    const repo = makeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(makeNoteEntity(RICH_HTML, storedState)),
    });
    const service = new CollaborationService(repo);

    const freshEmptyDoc = new Y.Doc();
    const room = makeRoom('note-1', freshEmptyDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).not.toHaveBeenCalled();

    freshEmptyDoc.destroy();
  });

  it('persistDocument still writes once the live Y.Doc has real content', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(makeNoteEntity(RICH_HTML, null)),
    });
    const service = new CollaborationService(repo);

    const hydratedDoc = new Y.Doc();
    Y.applyUpdate(hydratedDoc, htmlToYjsState(RICH_HTML));
    const room = makeRoom('note-1', hydratedDoc);

    // @ts-expect-error — private debounced persister is the test seam
    await service.persistDocument(room);

    expect(repo.updateYjsState).toHaveBeenCalledTimes(1);
    const [, persistedBuffer] = (
      repo.updateYjsState as unknown as { mock: { calls: [string, Buffer][] } }
    ).mock.calls[0];

    const verifyDoc = new Y.Doc();
    Y.applyUpdate(verifyDoc, persistedBuffer);
    expect(
      verifyDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME).toString()
    ).toContain('Survive this');
    verifyDoc.destroy();
    hydratedDoc.destroy();
  });
});
