import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import type { NoteRepository } from '../../notes/domain';
import { HocuspocusPersistenceExtension } from './hocuspocus-persistence.extension';

describe('HocuspocusPersistenceExtension', () => {
  it('should hydrate Y.Doc from stored state on load', async () => {
    const initialDoc = new Y.Doc();
    const initialFragment = initialDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    const initialParagraph = new Y.XmlElement('paragraph');
    initialParagraph.insert(0, [new Y.XmlText('Hello')]);
    initialFragment.insert(0, [initialParagraph]);
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
    expect(
      (loaded as Y.Doc).getXmlFragment(YJS_XML_FRAGMENT_NAME).toString()
    ).toContain('Hello');
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

  it('should return null and not crash when stored yjsState is malformed', async () => {
    const repo = {
      findById: vi
        .fn()
        .mockResolvedValue({
          id: 'note-1',
          yjsState: Buffer.from([0xff, 0xff, 0x00]),
        }),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
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
    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Stored')]);
    fragment.insert(0, [paragraph]);

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
    expect(
      verifyDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME).toString()
    ).toContain('Stored');
  });

  it('should skip persistence when live Y.Doc is trivial and stored content is non-trivial', async () => {
    const updateYjsState = vi.fn();
    const findById = vi.fn().mockResolvedValue({
      id: 'note-1',
      content: '<p>Real content</p>',
    });
    const repo = {
      updateYjsState,
      findById,
    } as unknown as NoteRepository;

    // A fresh, empty Y.Doc that hasn't loaded the stored content yet.
    const doc = new Y.Doc();

    const ext = new HocuspocusPersistenceExtension(repo);
    await ext.toExtension().onStoreDocument?.({
      document: doc,
      documentName: 'note-1',
    } as never);

    expect(updateYjsState).not.toHaveBeenCalled();
  });
});
