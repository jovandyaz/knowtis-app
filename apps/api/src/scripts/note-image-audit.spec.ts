import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

import { IMAGE_NODE_NAME, YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import {
  editorSchema,
  SRC_ATTR,
  yjsStateToHtml,
} from '../modules/notes/infrastructure/html-to-yjs';
import { SCAN_BATCH_SIZE } from './id-keyset-scan';
import {
  auditNoteImages,
  INCOMPLETE_STATE,
  type NoteImageState,
  type NoteImageStore,
} from './note-image-audit';

const STORED_SRC = `https://${STORED_IMAGE_HOST}/kept.png`;
const FOREIGN_SRC = 'https://evil.example/pixel.png?leak=secret';
const FOREIGN_HOST = 'evil.example';
const TRASHED_AT = new Date('2026-09-01T00:00:00.000Z');
const TRUNCATED_LENGTH = 8;

function imageNode(src: string): JSONContent {
  return { type: IMAGE_NODE_NAME, attrs: { src } };
}

function stateOf(content: JSONContent[]): Buffer {
  const doc = prosemirrorJSONToYDoc(
    editorSchema,
    { type: 'doc', content },
    YJS_XML_FRAGMENT_NAME
  );
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return state;
}

function deltaOnly(change: (fragment: Y.XmlFragment) => void): Buffer {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
  fragment.insert(0, [new Y.XmlElement('paragraph')]);
  const before = Y.encodeStateVector(doc);
  change(fragment);
  const delta = Buffer.from(Y.encodeStateAsUpdate(doc, before));
  doc.destroy();
  return delta;
}

function img(src: string): string {
  return `<figure data-image><img src="${src}"></figure>`;
}

function note(
  id: string,
  fields: Partial<Omit<NoteImageState, 'id'>> = {}
): NoteImageState {
  return { id, content: '', yjsState: null, deletedAt: null, ...fields };
}

function memoryStore(seed: readonly NoteImageState[]): NoteImageStore {
  const byId = [...seed].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    async statesAfter(after, limit) {
      return byId
        .filter((row) => after === null || row.id > after)
        .slice(0, limit);
    },
  };
}

describe('auditNoteImages', () => {
  it('reads a foreign image from the CRDT state, which the rendered HTML no longer shows', async () => {
    const yjsState = stateOf([
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      { type: 'blockquote', content: [imageNode(FOREIGN_SRC)] },
      imageNode(STORED_SRC),
    ]);
    const content = yjsStateToHtml(yjsState);

    const report = await auditNoteImages(
      memoryStore([note('a', { yjsState, content })])
    );

    expect(content).not.toContain(FOREIGN_HOST);
    expect(report).toEqual({
      scanned: 1,
      scannedInTrash: 0,
      foreign: [{ id: 'a', inState: [FOREIGN_HOST], inContent: [] }],
      foreignInTrash: [],
      unreadable: [],
    });
  });

  it('finds images nested in lists and tables, in the state and in the content', async () => {
    const listSrc = 'https://list.example/a.png';
    const tableSrc = 'https://table.example/b.png';
    const yjsState = stateOf([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph' },
              {
                type: 'orderedList',
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph' }, imageNode(listSrc)],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [imageNode(tableSrc)] }],
          },
        ],
      },
    ]);
    const content = [
      `<ul><li><p></p><ol><li><p></p>${img(listSrc)}</li></ol></li></ul>`,
      `<table><tbody><tr><td>${img(tableSrc)}</td></tr></tbody></table>`,
    ].join('');

    const report = await auditNoteImages(
      memoryStore([note('a', { yjsState, content })])
    );

    expect(report.foreign).toEqual([
      {
        id: 'a',
        inState: ['list.example', 'table.example'],
        inContent: ['list.example', 'table.example'],
      },
    ]);
  });

  it('reports each foreign host in the content column once, by host alone', async () => {
    const content = [
      img(FOREIGN_SRC),
      img('https://evil.example/other.gif?leak=more'),
      `<p><IMG SRC="https://Tracker.EXAMPLE:8443/p.gif"></p>`,
      img(STORED_SRC),
    ].join('');

    const report = await auditNoteImages(memoryStore([note('a', { content })]));

    expect(report.foreign).toEqual([
      {
        id: 'a',
        inState: [],
        inContent: [FOREIGN_HOST, 'tracker.example:8443'],
      },
    ]);
  });

  it('labels a src by where a browser would fetch it from', async () => {
    const content = [
      img('/t/pixel.gif'),
      img('//cdn.evil.example/x.png'),
      img('data:image/png;base64,AAAA'),
      img('https://[broken'),
    ].join('');

    const report = await auditNoteImages(memoryStore([note('a', { content })]));

    expect(report.foreign).toEqual([
      {
        id: 'a',
        inState: [],
        inContent: ['relative', 'cdn.evil.example', 'data:', 'invalid URL'],
      },
    ]);
  });

  it('leaves out stored images, images without a src and URLs that are not an img src', async () => {
    const content = [
      img(STORED_SRC),
      '<img src="">',
      '<img alt="no source">',
      `<p>${FOREIGN_SRC}</p>`,
      `<a href="${FOREIGN_SRC}">link</a>`,
      `<script>document.write('<img src="${FOREIGN_SRC}">')</script>`,
    ].join('');
    const yjsState = stateOf([imageNode(STORED_SRC), imageNode('')]);

    const report = await auditNoteImages(
      memoryStore([note('a', { content, yjsState })])
    );

    expect(report).toEqual({
      scanned: 1,
      scannedInTrash: 0,
      foreign: [],
      foreignInTrash: [],
      unreadable: [],
    });
  });

  it('lists notes in the trash apart from live ones and counts both', async () => {
    const report = await auditNoteImages(
      memoryStore([
        note('a', { content: img(FOREIGN_SRC) }),
        note('b', { content: img(STORED_SRC) }),
        note('c', {
          yjsState: stateOf([imageNode(FOREIGN_SRC)]),
          deletedAt: TRASHED_AT,
        }),
        note('d', { content: img(STORED_SRC), deletedAt: TRASHED_AT }),
        note('e'),
      ])
    );

    expect(report).toEqual({
      scanned: 5,
      scannedInTrash: 2,
      foreign: [{ id: 'a', inState: [], inContent: [FOREIGN_HOST] }],
      foreignInTrash: [{ id: 'c', inState: [FOREIGN_HOST], inContent: [] }],
      unreadable: [],
    });
  });

  it('reports a CRDT state it cannot read and still audits the note content', async () => {
    const report = await auditNoteImages(
      memoryStore([
        note('a', {
          yjsState: stateOf([imageNode(FOREIGN_SRC)]).subarray(
            0,
            TRUNCATED_LENGTH
          ),
          content: img(FOREIGN_SRC),
        }),
        note('b', { content: img(FOREIGN_SRC) }),
      ])
    );

    expect(report.unreadable).toEqual([
      { id: 'a', reason: expect.stringMatching(/\S/) },
    ]);
    expect(report.foreign).toEqual([
      { id: 'a', inState: [], inContent: [FOREIGN_HOST] },
      { id: 'b', inState: [], inContent: [FOREIGN_HOST] },
    ]);
  });

  it('reports a CRDT state that depends on updates it does not hold as unreadable, not clean', async () => {
    const withForeignImage = deltaOnly((fragment) => {
      const image = new Y.XmlElement(IMAGE_NODE_NAME);
      fragment.insert(1, [image]);
      image.setAttribute(SRC_ATTR, FOREIGN_SRC);
    });
    const deletingWhatItLacks = deltaOnly((fragment) => fragment.delete(0, 1));

    const report = await auditNoteImages(
      memoryStore([
        note('a', { yjsState: withForeignImage }),
        note('b', { yjsState: deletingWhatItLacks }),
      ])
    );

    expect(report).toEqual({
      scanned: 2,
      scannedInTrash: 0,
      foreign: [],
      foreignInTrash: [],
      unreadable: [
        { id: 'a', reason: INCOMPLETE_STATE },
        { id: 'b', reason: INCOMPLETE_STATE },
      ],
    });
  });

  it('reads an empty CRDT state as a note without one', async () => {
    const report = await auditNoteImages(
      memoryStore([note('a', { yjsState: Buffer.alloc(0) })])
    );

    expect(report.unreadable).toEqual([]);
  });

  it('reads past the first batch', async () => {
    const ids = Array.from(
      { length: SCAN_BATCH_SIZE + 1 },
      (_, index) => `note-${String(index).padStart(3, '0')}`
    );

    const report = await auditNoteImages(
      memoryStore(ids.map((id) => note(id, { content: img(FOREIGN_SRC) })))
    );

    expect(report.scanned).toBe(ids.length);
    expect(report.foreign.map(({ id }) => id)).toEqual(ids);
  });
});
