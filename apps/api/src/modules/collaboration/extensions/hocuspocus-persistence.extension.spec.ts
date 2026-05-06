import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { NoteRepository } from '../../notes/domain';
import { HocuspocusPersistenceExtension } from './hocuspocus-persistence.extension';

describe('HocuspocusPersistenceExtension', () => {
  it('should hydrate Y.Doc from stored state on load', async () => {
    const initialDoc = new Y.Doc();
    initialDoc.getText('content').insert(0, 'Hello');
    const storedState = Buffer.from(Y.encodeStateAsUpdate(initialDoc));

    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'note-1',
        yjsState: storedState,
      }),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
    } as never);

    expect(loaded).toBeInstanceOf(Y.Doc);
    expect((loaded as Y.Doc).getText('content').toString()).toBe('Hello');
  });

  it('should return null when note has no stored state', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({ id: 'note-1', yjsState: null }),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
    } as never);

    expect(loaded).toBeNull();
  });

  it('should return null when note does not exist', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'missing',
    } as never);

    expect(loaded).toBeNull();
  });

  it('should persist Y.Doc state on store', async () => {
    const updateYjsState = vi.fn().mockResolvedValue(
      ok({
        id: 'note-1',
        title: 'Test',
        content: '',
        ownerId: 'user-1',
        generalAccess: 'restricted',
        generalAccessPermission: 'viewer',
        shareToken: null,
        editorsCanShare: false,
        yjsState: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    const repo = { updateYjsState } as unknown as NoteRepository;

    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'Stored');

    const ext = new HocuspocusPersistenceExtension(repo);
    await ext.toExtension().onStoreDocument?.({
      document: doc,
      documentName: 'note-1',
    } as never);

    expect(updateYjsState).toHaveBeenCalledTimes(1);
    const [calledId, calledBuffer] = updateYjsState.mock.calls[0];
    expect(calledId).toBe('note-1');
    expect(Buffer.isBuffer(calledBuffer)).toBe(true);

    // Round-trip: hydrate a fresh doc from the persisted buffer and verify content.
    const verifyDoc = new Y.Doc();
    Y.applyUpdate(verifyDoc, new Uint8Array(calledBuffer));
    expect(verifyDoc.getText('content').toString()).toBe('Stored');
  });
});
