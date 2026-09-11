import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  GhostText,
  type GhostTextProvider,
  type GhostTextStreamInput,
} from './ghost-text';

const DEBOUNCE_MS = 50;
const MIN_CONTENT_LENGTH = 5;
const SEED = 'The quick brown fox';
const SUGGESTION = 'hello world';
const YJS_FIELD = 'default';

interface RecordingProvider extends GhostTextProvider {
  calls: GhostTextStreamInput[];
}

function createProvider(
  chunks: readonly string[] = [SUGGESTION]
): RecordingProvider {
  const calls: GhostTextStreamInput[] = [];
  return {
    calls,
    async *stream(input: GhostTextStreamInput) {
      calls.push(input);
      for (const text of chunks) {
        if (input.signal.aborted) {
          return;
        }
        yield { text };
      }
    },
  };
}

interface Gate {
  promise: Promise<string | null>;
  resolve: (chunk: string | null) => void;
}

interface GatedProvider extends RecordingProvider {
  release(index: number, chunk: string | null): Promise<void>;
}

function createGate(): Gate {
  let resolve: (chunk: string | null) => void = () => undefined;
  const promise = new Promise<string | null>((settleGate) => {
    resolve = settleGate;
  });
  return { promise, resolve };
}

function createGatedProvider(): GatedProvider {
  const calls: GhostTextStreamInput[] = [];
  const gates: Gate[] = [];

  function gateAt(index: number): Gate {
    gates[index] ??= createGate();
    return gates[index];
  }

  return {
    calls,
    async *stream(input: GhostTextStreamInput) {
      calls.push(input);
      for (let index = 0; ; index++) {
        const text = await gateAt(index).promise;
        if (text === null || input.signal.aborted) {
          return;
        }
        yield { text };
      }
    },
    async release(index: number, chunk: string | null) {
      gateAt(index).resolve(chunk);
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

let editor: Editor;

function ghostText(provider: GhostTextProvider) {
  return GhostText.configure({
    provider,
    debounceMs: DEBOUNCE_MS,
    minContentLength: MIN_CONTENT_LENGTH,
    enabled: true,
  });
}

function focusEditor() {
  vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
}

function mount(provider: GhostTextProvider): Editor {
  editor = new Editor({
    extensions: [StarterKit, ghostText(provider)],
    content: `<p>${SEED}</p>`,
  });
  focusEditor();
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
}

function mountCollaborative(provider: GhostTextProvider): Y.Doc {
  const yDoc = new Y.Doc();
  editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: yDoc, field: YJS_FIELD }),
      ghostText(provider),
    ],
  });
  focusEditor();
  return yDoc;
}

function applyRemoteEdit(yDoc: Y.Doc) {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('written by a collaborator')]);
  yDoc.transact(() => {
    const fragment = yDoc.getXmlFragment(YJS_FIELD);
    fragment.insert(fragment.length, [paragraph]);
  });
}

function type(text: string) {
  editor.commands.insertContent(text);
}

async function settle() {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
}

function visibleSuggestion(): string | null {
  return (
    editor.view.dom.querySelector('.ghost-text-suggestion')?.textContent ?? null
  );
}

function press(key: string) {
  return editor.view.someProp('handleKeyDown', (handler) =>
    handler(
      editor.view,
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    )
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('GhostText requests', () => {
  it('streams one suggestion into the document after the debounce', async () => {
    const provider = createProvider();
    mount(provider);

    type('!');
    await settle();

    expect(provider.calls).toHaveLength(1);
    expect(visibleSuggestion()).toBe(SUGGESTION);
  });

  it('keeps the suggestion when the editor is toggled read-only and back', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    editor.setEditable(false);
    editor.setEditable(true);
    await settle();

    expect(visibleSuggestion()).toBe(SUGGESTION);
    expect(provider.calls).toHaveLength(1);
  });

  it('never requests when the change only toggles formatting', async () => {
    const provider = createProvider();
    mount(provider);
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from: end - 3, to: end });

    editor.commands.toggleBold();
    await settle();

    expect(provider.calls).toHaveLength(0);
  });

  it('never requests while the editor does not have focus', async () => {
    const provider = createProvider();
    mount(provider);
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(false);

    type('!');
    await settle();

    expect(provider.calls).toHaveLength(0);
    expect(visibleSuggestion()).toBeNull();
  });

  it('drops the suggestion without requesting when a collaborator edits', async () => {
    const provider = createProvider();
    const yDoc = mountCollaborative(provider);
    type(SEED);
    await settle();
    expect(visibleSuggestion()).toBe(SUGGESTION);

    applyRemoteEdit(yDoc);

    expect(visibleSuggestion()).toBeNull();
    await settle();
    expect(provider.calls).toHaveLength(1);
  });

  it('cancels the pending request and the suggestion when the caret moves', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    editor.commands.setTextSelection(2);
    await settle();

    expect(visibleSuggestion()).toBeNull();
    expect(provider.calls).toHaveLength(1);
  });
});

describe('GhostText type-through', () => {
  it('trims the suggestion to what is left of it', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    type('he');
    await settle();

    expect(visibleSuggestion()).toBe('llo world');
    expect(provider.calls).toHaveLength(1);
  });

  it('re-arms the debounce once the whole suggestion has been typed', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    type(SUGGESTION);
    expect(visibleSuggestion()).toBeNull();
    await settle();

    expect(provider.calls).toHaveLength(2);
  });

  it('clears and re-requests when the typed character diverges', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    type('x');
    expect(visibleSuggestion()).toBeNull();
    await settle();

    expect(provider.calls).toHaveLength(2);
  });
});

describe('GhostText type-through while the stream is open', () => {
  it('trims what has arrived without killing the stream', async () => {
    const provider = createGatedProvider();
    mount(provider);
    type('!');
    await settle();
    await provider.release(0, 'hello');
    expect(visibleSuggestion()).toBe('hello');

    type('he');

    expect(visibleSuggestion()).toBe('llo');
    expect(provider.calls[0].signal.aborted).toBe(false);

    await provider.release(1, ' world');

    expect(visibleSuggestion()).toBe('llo world');
    expect(provider.calls).toHaveLength(1);
  });

  it('waits for the next chunk instead of re-requesting when the typing catches up', async () => {
    const provider = createGatedProvider();
    mount(provider);
    type('!');
    await settle();
    await provider.release(0, 'hello');

    type('hello');
    await settle();

    expect(visibleSuggestion()).toBeNull();
    expect(provider.calls).toHaveLength(1);

    await provider.release(1, ' world');

    expect(visibleSuggestion()).toBe(' world');
  });
});

describe('GhostText keyboard shortcuts', () => {
  it('accepts the suggestion on Tab', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    press('Tab');

    expect(editor.getText()).toContain(`${SEED}!${SUGGESTION}`);
    expect(visibleSuggestion()).toBeNull();
  });

  it('dismisses the suggestion on Escape', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    press('Escape');

    expect(visibleSuggestion()).toBeNull();
  });
});

describe('GhostText enabled toggle', () => {
  it('hides the visible suggestion and stops requesting once disabled', async () => {
    const provider = createProvider();
    mount(provider);
    type('!');
    await settle();

    editor.commands.setGhostTextEnabled(false);
    expect(visibleSuggestion()).toBeNull();

    type('?');
    await settle();

    expect(provider.calls).toHaveLength(1);
  });

  it('requests again once re-enabled', async () => {
    const provider = createProvider();
    mount(provider);
    editor.commands.setGhostTextEnabled(false);
    type('!');
    await settle();
    expect(provider.calls).toHaveLength(0);

    editor.commands.setGhostTextEnabled(true);
    type('?');
    await settle();

    expect(provider.calls).toHaveLength(1);
    expect(visibleSuggestion()).toBe(SUGGESTION);
  });
});
