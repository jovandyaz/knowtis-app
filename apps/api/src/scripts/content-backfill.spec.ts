import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import {
  htmlToYjsState,
  yjsStateToHtml,
} from '../modules/notes/infrastructure/html-to-yjs';
import {
  BACKFILL_BATCH_SIZE,
  backfillNoteContent,
  CONTENT_DECISION,
  decideContent,
  EMPTY_STATE_OVER_CONTENT,
  type NoteContentStore,
  type NoteState,
} from './content-backfill';

const LIVE_HTML = '<p>Intro</p><p>Written after the column froze</p>';
const FROZEN_HTML = '<p>Intro</p>';
const UNKNOWN_NODE = 'comment';

function stateWithUnknownNode(): Buffer {
  const doc = new Y.Doc();
  doc
    .getXmlFragment(YJS_XML_FRAGMENT_NAME)
    .insert(0, [new Y.XmlElement(UNKNOWN_NODE)]);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return state;
}

function currentNote(id: string): NoteState {
  const yjsState = htmlToYjsState(LIVE_HTML);
  return {
    id,
    content: yjsStateToHtml(yjsState),
    yjsState,
    hasEmbedding: true,
  };
}

function frozenNote(id: string, hasEmbedding = true): NoteState {
  return {
    id,
    content: FROZEN_HTML,
    yjsState: htmlToYjsState(LIVE_HTML),
    hasEmbedding,
  };
}

function unrenderableNote(id: string): NoteState {
  return {
    id,
    content: FROZEN_HTML,
    yjsState: stateWithUnknownNode(),
    hasEmbedding: true,
  };
}

function memoryStore(seed: readonly NoteState[]) {
  const rows = new Map(seed.map((note) => [note.id, note]));
  const staleEmbeddings = new Set<string>();
  const store: NoteContentStore = {
    async statesAfter(after, limit) {
      return [...rows.values()]
        .filter((note) => after === null || note.id > after)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, limit);
    },
    async replaceContent(note, html) {
      const stored = rows.get(note.id);
      if (!stored?.yjsState.equals(note.yjsState)) {
        return { written: false, embeddingMarkedStale: false };
      }
      rows.set(note.id, { ...stored, content: html });
      if (stored.hasEmbedding) {
        staleEmbeddings.add(note.id);
      }
      return { written: true, embeddingMarkedStale: stored.hasEmbedding };
    },
  };
  return { store, rows, staleEmbeddings };
}

describe('decideContent', () => {
  it('leaves content that already matches its state', () => {
    const note = currentNote('a');

    expect(decideContent(note.yjsState, note.content)).toEqual({
      kind: CONTENT_DECISION.UNCHANGED,
    });
  });

  it('renders content that fell behind its state from the state', () => {
    const note = frozenNote('a');

    expect(decideContent(note.yjsState, note.content)).toEqual({
      kind: CONTENT_DECISION.CHANGED,
      html: LIVE_HTML,
    });
  });

  it('reports a state the schema cannot render, with the cause', () => {
    const note = unrenderableNote('a');

    expect(decideContent(note.yjsState, note.content)).toEqual({
      kind: CONTENT_DECISION.FAILED,
      reason: `Unknown node type: ${UNKNOWN_NODE}`,
    });
  });

  it('refuses to empty a note whose state renders nothing', () => {
    expect(
      decideContent(htmlToYjsState(''), '<p>The only copy left</p>')
    ).toEqual({
      kind: CONTENT_DECISION.FAILED,
      reason: EMPTY_STATE_OVER_CONTENT,
    });
  });
});

describe('backfillNoteContent', () => {
  it('lists the notes and embeddings a dry run would touch, and writes nothing', async () => {
    const { store, rows, staleEmbeddings } = memoryStore([
      currentNote('a'),
      frozenNote('b'),
      unrenderableNote('c'),
      frozenNote('d', false),
    ]);

    const report = await backfillNoteContent(store, { apply: false });

    expect(report).toEqual({
      scanned: 4,
      unchanged: 1,
      changed: ['b', 'd'],
      superseded: [],
      failed: [{ id: 'c', reason: `Unknown node type: ${UNKNOWN_NODE}` }],
      embeddingsMarkedStale: 1,
    });
    expect(rows.get('b')?.content).toBe(FROZEN_HTML);
    expect([...staleEmbeddings]).toEqual([]);
  });

  it('writes the repaired content and marks its embedding stale, so a second run changes nothing', async () => {
    const { store, rows, staleEmbeddings } = memoryStore([
      currentNote('a'),
      frozenNote('b'),
      frozenNote('c', false),
    ]);

    const first = await backfillNoteContent(store, { apply: true });
    const second = await backfillNoteContent(store, { apply: true });

    expect(rows.get('b')?.content).toBe(LIVE_HTML);
    expect(first.changed).toEqual(['b', 'c']);
    expect(first.embeddingsMarkedStale).toBe(1);
    expect([...staleEmbeddings]).toEqual(['b']);
    expect(second).toEqual({
      scanned: 3,
      unchanged: 3,
      changed: [],
      superseded: [],
      failed: [],
      embeddingsMarkedStale: 0,
    });
  });

  it('leaves a note saved during the run to that save', async () => {
    const { store, rows } = memoryStore([frozenNote('a')]);
    const newer = htmlToYjsState('<p>Saved while the backfill ran</p>');
    const readStates = store.statesAfter.bind(store);
    store.statesAfter = async (after, limit) => {
      const batch = await readStates(after, limit);
      rows.set('a', {
        id: 'a',
        content: '<p>newer</p>',
        yjsState: newer,
        hasEmbedding: true,
      });
      return batch;
    };

    const report = await backfillNoteContent(store, { apply: true });

    expect(report.superseded).toEqual(['a']);
    expect(report.changed).toEqual([]);
    expect(report.embeddingsMarkedStale).toBe(0);
    expect(rows.get('a')?.content).toBe('<p>newer</p>');
  });

  it('counts a write that fails and carries on with the next note', async () => {
    const { store, rows } = memoryStore([frozenNote('a'), frozenNote('b')]);
    const write = store.replaceContent.bind(store);
    store.replaceContent = async (note, html) => {
      if (note.id === 'a') {
        throw new Error('connection reset');
      }
      return write(note, html);
    };

    const report = await backfillNoteContent(store, { apply: true });

    expect(report.failed).toEqual([{ id: 'a', reason: 'connection reset' }]);
    expect(report.changed).toEqual(['b']);
    expect(rows.get('b')?.content).toBe(LIVE_HTML);
  });

  it('reads past the first batch', async () => {
    const ids = Array.from(
      { length: BACKFILL_BATCH_SIZE + 1 },
      (_, index) => `note-${String(index).padStart(3, '0')}`
    );
    const { store } = memoryStore(ids.map((id) => frozenNote(id)));

    const report = await backfillNoteContent(store, { apply: false });

    expect(report.scanned).toBe(ids.length);
    expect(report.changed).toEqual(ids);
  });
});
