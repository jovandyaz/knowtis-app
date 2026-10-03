import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { logger } from '@knowtis/shared-util';

import { createMessageHandler } from './YjsProvider.helpers';
import type { DocumentResources } from './YjsProvider.types';

const NOTE_ID = 'note-1';

function resourcesWith(doc: Y.Doc): DocumentResources {
  return { docs: new Map([[NOTE_ID, doc]]), persistence: new Map() };
}

function messageEvent(data: unknown) {
  return new MessageEvent('message', { data });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMessageHandler', () => {
  it("applies another tab's document update to the note's doc", () => {
    const doc = new Y.Doc();
    const otherTab = new Y.Doc();
    otherTab.getText('body').insert(0, 'typed in another tab');
    const handle = createMessageHandler(resourcesWith(doc));

    handle(
      messageEvent({
        type: 'update',
        noteId: NOTE_ID,
        updates: Array.from(Y.encodeStateAsUpdate(otherTab)),
      })
    );

    expect(doc.getText('body').toString()).toBe('typed in another tab');
  });

  it('ignores an update message that carries no update', () => {
    const doc = new Y.Doc();
    const logged = vi.spyOn(logger, 'error');
    const handle = createMessageHandler(resourcesWith(doc));

    handle(messageEvent({ type: 'update', noteId: NOTE_ID }));

    expect(logged).not.toHaveBeenCalled();
    expect(Y.encodeStateVector(doc)).toEqual(Y.encodeStateVector(new Y.Doc()));
  });

  it.each(['presence', 'leave'])(
    'ignores a %s message from a tab running an older build',
    (type) => {
      const doc = new Y.Doc();
      const logged = vi.spyOn(logger, 'error');
      const handle = createMessageHandler(resourcesWith(doc));

      handle(
        messageEvent({
          type,
          noteId: NOTE_ID,
          user: { id: 'tab-2', name: 'Old Tab', color: '#f87171' },
        })
      );

      expect(logged).not.toHaveBeenCalled();
      expect(Y.encodeStateVector(doc)).toEqual(
        Y.encodeStateVector(new Y.Doc())
      );
    }
  );
});
