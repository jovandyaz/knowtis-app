import { Logger } from '@nestjs/common';
import { ok } from 'neverthrow';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import type { NoteRepository } from '../../notes/domain';
import * as htmlToYjs from '../../notes/infrastructure/html-to-yjs';
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

  it('should return null when note has no stored state and trivial content', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'note-1',
        yjsState: null,
        content: '<p></p>',
      }),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
    } as never);

    expect(loaded).toBeNull();
  });

  it('should hydrate legacy notes from HTML content when yjsState is missing', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'note-1',
        yjsState: null,
        content: '<h2>Legacy</h2><p>body text</p>',
      }),
    } as unknown as NoteRepository;

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
    } as never);

    expect(loaded).toBeInstanceOf(Y.Doc);
    const text = (loaded as Y.Doc)
      .getXmlFragment(YJS_XML_FRAGMENT_NAME)
      .toString();
    expect(text).toContain('Legacy');
    expect(text).toContain('body text');
  });

  it('should return null when legacy HTML conversion fails', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'note-1',
        yjsState: null,
        content: '<h2>Legacy</h2>',
      }),
    } as unknown as NoteRepository;
    const spy = vi.spyOn(htmlToYjs, 'htmlToYjsState').mockImplementation(() => {
      throw new Error('parser exploded');
    });

    const ext = new HocuspocusPersistenceExtension(repo);
    const loaded = await ext.toExtension().onLoadDocument?.({
      documentName: 'note-1',
    } as never);

    expect(loaded).toBeNull();
    spy.mockRestore();
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
      findById: vi.fn().mockResolvedValue({
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

  it('should persist derived HTML content and yjsState on store', async () => {
    const updateContentWithYjsState = vi.fn().mockResolvedValue(
      ok({
        id: 'note-1',
        title: 'Test',
        content: '<p>Stored</p>',
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
    const repo = { updateContentWithYjsState } as unknown as NoteRepository;

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

    expect(updateContentWithYjsState).toHaveBeenCalledTimes(1);
    const [calledId, data, buffer] = updateContentWithYjsState.mock.calls[0];
    expect(calledId).toBe('note-1');
    expect(data.content).toContain('Stored');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  describe('when the live document cannot be rendered to HTML', () => {
    const RENDER_ERROR = 'Unknown node type: aiBlock';

    let logError: MockInstance<Logger['error']>;
    let logWarn: MockInstance<Logger['warn']>;

    beforeEach(() => {
      vi.spyOn(htmlToYjs, 'yDocToHtml').mockImplementation(() => {
        throw new Error(RENDER_ERROR);
      });
      logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      logWarn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function storeUnrenderableDocument() {
      const updateContentWithYjsState = vi.fn();
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
      const repo = {
        updateContentWithYjsState,
        updateYjsState,
      } as unknown as NoteRepository;

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

      return { updateContentWithYjsState, updateYjsState };
    }

    it('persists the CRDT state alone', async () => {
      const { updateContentWithYjsState, updateYjsState } =
        await storeUnrenderableDocument();

      expect(updateContentWithYjsState).not.toHaveBeenCalled();
      expect(updateYjsState).toHaveBeenCalledTimes(1);
    });

    it('logs an error naming the note and the cause, never its content', async () => {
      await storeUnrenderableDocument();

      expect(logError.mock.calls).toEqual([
        [
          `Failed to render note note-1 to HTML, persisting yjsState only: ${RENDER_ERROR}`,
        ],
      ]);
      expect(logWarn).not.toHaveBeenCalled();
    });
  });

  it('should skip persistence when live Y.Doc is trivial and stored content is non-trivial', async () => {
    const updateContentWithYjsState = vi.fn();
    const updateYjsState = vi.fn();
    const findById = vi.fn().mockResolvedValue({
      id: 'note-1',
      content: '<p>Real content</p>',
    });
    const repo = {
      updateContentWithYjsState,
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

    expect(updateContentWithYjsState).not.toHaveBeenCalled();
    expect(updateYjsState).not.toHaveBeenCalled();
  });
});
