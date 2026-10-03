import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

import { CollaborativeCursors } from './CollaborativeCursors';

const REMOTE_USER = { name: 'Remote Heron', color: '#22d3ee' };
const CARET_SELECTOR = '.collaboration-carets__caret';

const owned: Array<{ destroy: () => void }> = [];

function own<T extends { destroy: () => void }>(resource: T): T {
  owned.push(resource);
  return resource;
}

function awarenessOnNewDoc(): Awareness {
  const doc = own(new Y.Doc());
  return own(new Awareness(doc));
}

function mount(): Editor {
  return own(
    new Editor({
      element: document.body.appendChild(document.createElement('div')),
      extensions: [StarterKit, CollaborativeCursors],
      content: '<p>Shared paragraph</p>',
    })
  );
}

function receiveRemoteCursor(awareness: Awareness) {
  const remote = awarenessOnNewDoc();
  remote.setLocalState({ user: REMOTE_USER, cursor: { anchor: 2, head: 2 } });
  applyAwarenessUpdate(
    awareness,
    encodeAwarenessUpdate(remote, [remote.clientID]),
    'remote'
  );
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function remoteCarets(editor: Editor) {
  return Array.from(editor.view.dom.querySelectorAll(CARET_SELECTOR)).map(
    (caret) => caret.textContent
  );
}

afterEach(() => {
  owned
    .splice(0)
    .reverse()
    .forEach((resource) => resource.destroy());
  document.body.innerHTML = '';
});

describe('CollaborativeCursors', () => {
  it('publishes the local selection on the awareness it is given and renders its remote cursors', async () => {
    const editor = mount();
    const awareness = awarenessOnNewDoc();

    editor.commands.setCursorsAwareness(awareness);
    editor.commands.setTextSelection({ from: 3, to: 5 });
    receiveRemoteCursor(awareness);
    await nextFrame();

    expect(awareness.getLocalState()?.['cursor']).toEqual({
      anchor: 3,
      head: 5,
    });
    expect(remoteCarets(editor)).toEqual([REMOTE_USER.name]);
  });

  it('publishes a selection made while remote cursors are still being redrawn', async () => {
    const editor = mount();
    const awareness = awarenessOnNewDoc();
    editor.commands.setCursorsAwareness(awareness);

    receiveRemoteCursor(awareness);
    editor.commands.setTextSelection(6);
    await nextFrame();

    expect(awareness.getLocalState()?.['cursor']).toEqual({
      anchor: 6,
      head: 6,
    });
  });

  it('moves to a new awareness on the same editor, keeping the selection', async () => {
    const editor = mount();
    const previous = awarenessOnNewDoc();
    const next = awarenessOnNewDoc();
    editor.commands.setCursorsAwareness(previous);
    editor.commands.setTextSelection({ from: 3, to: 5 });

    editor.commands.setCursorsAwareness(next);
    receiveRemoteCursor(next);
    await nextFrame();

    expect(editor.isDestroyed).toBe(false);
    expect(editor.state.selection.from).toBe(3);
    expect(editor.state.selection.to).toBe(5);
    expect(next.getLocalState()?.['cursor']).toEqual({ anchor: 3, head: 5 });
    expect(previous.getLocalState()?.['cursor']).toBeNull();
    expect(remoteCarets(editor)).toEqual([REMOTE_USER.name]);
  });

  it('stops following an awareness it was moved away from', async () => {
    const editor = mount();
    const previous = awarenessOnNewDoc();
    editor.commands.setCursorsAwareness(previous);

    editor.commands.setCursorsAwareness(awarenessOnNewDoc());
    receiveRemoteCursor(previous);
    editor.commands.setTextSelection(4);
    await nextFrame();

    expect(remoteCarets(editor)).toEqual([]);
    expect(previous.getLocalState()?.['cursor']).toBeNull();
  });

  it('renders no remote cursors once the awareness is withdrawn', async () => {
    const editor = mount();
    const awareness = awarenessOnNewDoc();
    editor.commands.setCursorsAwareness(awareness);
    receiveRemoteCursor(awareness);
    await nextFrame();

    editor.commands.setCursorsAwareness(null);
    await nextFrame();

    expect(remoteCarets(editor)).toEqual([]);
    expect(awareness.getLocalState()?.['cursor']).toBeNull();
  });

  it('clears the local cursor when the editor is destroyed', () => {
    const editor = mount();
    const awareness = awarenessOnNewDoc();
    editor.commands.setCursorsAwareness(awareness);

    editor.destroy();

    expect(awareness.getLocalState()?.['cursor']).toBeNull();
  });
});
