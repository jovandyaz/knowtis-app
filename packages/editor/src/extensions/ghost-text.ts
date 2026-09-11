import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import type { Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import './ghost-text.css';

const GhostTextPluginKey = new PluginKey('ghostText');

export interface GhostTextStreamInput {
  content: string;
  suffix?: string;
  signal: AbortSignal;
}

export interface GhostTextStreamChunk {
  text: string;
}

export interface GhostTextProvider {
  stream(input: GhostTextStreamInput): AsyncIterable<GhostTextStreamChunk>;
}

export interface GhostTextOptions {
  /** Provider that performs the AI completion. Required at runtime. */
  provider: GhostTextProvider | null;
  /** Debounce window after the last keystroke before a stream is requested. */
  debounceMs: number;
  /** Minimum content length (chars before the cursor) required to trigger. */
  minContentLength: number;
  /** Initial state of the runtime toggle; flip it with `setGhostTextEnabled`. */
  enabled: boolean;
  /**
   * Optional gating callback. When it returns true, requests are skipped —
   * for example, while another AI action is running.
   */
  isAIBusy?: () => boolean;
  /** Optional callback fired when the user accepts the suggestion. */
  onAccept?: (text: string) => void;
  /**
   * Called when the ghost-text stream fails. If unset, errors are silently
   * dropped — defer reporting decisions to the host (logger, error reporter).
   */
  onError?: (error: unknown) => void;
}

interface GhostTextStorage {
  completion: string;
  consumed: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  abortController: AbortController | null;
  lastCursorPos: number;
  enabled: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ghostText: {
      setGhostTextEnabled: (enabled: boolean) => ReturnType;
    };
  }
}

function remainingSuggestion(storage: GhostTextStorage): string {
  return storage.completion.slice(storage.consumed);
}

function resetSuggestion(storage: GhostTextStorage): void {
  storage.completion = '';
  storage.consumed = 0;
}

async function consumeStream(
  provider: GhostTextProvider,
  input: GhostTextStreamInput,
  storage: GhostTextStorage,
  editor: Editor,
  onError?: (error: unknown) => void
): Promise<void> {
  let chunks = '';

  try {
    for await (const chunk of provider.stream(input)) {
      if (input.signal.aborted) {
        return;
      }

      chunks += chunk.text;
      storage.completion = chunks;
      editor.view.dispatch(editor.state.tr);
    }
  } catch (error) {
    if (input.signal.aborted) {
      return;
    }

    onError?.(error);
    resetSuggestion(storage);
    editor.view.dispatch(editor.state.tr);
  }
}

function requestGhostSuggestion(
  content: string,
  suffix: string,
  storage: GhostTextStorage,
  editor: Editor,
  provider: GhostTextProvider,
  onError?: (error: unknown) => void
): void {
  const controller = new AbortController();
  storage.abortController = controller;
  resetSuggestion(storage);

  void consumeStream(
    provider,
    {
      content,
      ...(suffix && { suffix }),
      signal: controller.signal,
    },
    storage,
    editor,
    onError
  ).finally(() => {
    if (storage.abortController === controller) {
      storage.abortController = null;
    }
  });
}

function clearDebounce(storage: GhostTextStorage): void {
  if (storage.debounceTimer) {
    clearTimeout(storage.debounceTimer);
    storage.debounceTimer = null;
  }
}

function cancelPending(storage: GhostTextStorage): void {
  clearDebounce(storage);

  if (storage.abortController) {
    storage.abortController.abort();
    storage.abortController = null;
  }
}

function redraw(editor: Editor): void {
  editor.view.dispatch(editor.state.tr);
}

function discardSuggestion(storage: GhostTextStorage, editor: Editor): void {
  cancelPending(storage);

  const wasVisible = remainingSuggestion(storage).length > 0;
  resetSuggestion(storage);

  if (wasVisible) {
    redraw(editor);
  }
}

function textTypedAtCaret(
  transaction: Transaction,
  previousPos: number,
  nextPos: number
): string | null {
  if (transaction.steps.length !== 1 || nextPos <= previousPos) {
    return null;
  }

  const [step] = transaction.steps;
  if (
    !(step instanceof ReplaceStep) ||
    step.from !== previousPos ||
    step.to !== previousPos
  ) {
    return null;
  }

  const inserted = transaction.doc.textBetween(previousPos, nextPos, '\n');
  return inserted.length === nextPos - previousPos ? inserted : null;
}

export const GhostText = Extension.create<GhostTextOptions, GhostTextStorage>({
  name: 'ghostText',

  addOptions(): GhostTextOptions {
    return {
      provider: null,
      debounceMs: 750,
      minContentLength: 20,
      enabled: true,
    };
  },

  addStorage(): GhostTextStorage {
    return {
      completion: '',
      consumed: 0,
      debounceTimer: null,
      abortController: null,
      lastCursorPos: 0,
      enabled: this.options.enabled,
    };
  },

  addCommands() {
    return {
      setGhostTextEnabled: (enabled: boolean) => () => {
        this.storage.enabled = enabled;
        if (!enabled) {
          cancelPending(this.storage);
          resetSuggestion(this.storage);
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const suggestion = remainingSuggestion(this.storage);
        if (!suggestion) {
          return false;
        }

        cancelPending(this.storage);
        resetSuggestion(this.storage);
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(suggestion);
            return true;
          })
          .run();
        this.options.onAccept?.(suggestion);
        return true;
      },
      Escape: () => {
        if (!remainingSuggestion(this.storage)) {
          return false;
        }

        discardSuggestion(this.storage, this.editor);
        return true;
      },
    };
  },

  onTransaction({ transaction }) {
    const storage = this.storage;
    const editor = this.editor;
    const { selection, doc } = editor.state;
    const cursorPos = selection.from;
    const previousPos = storage.lastCursorPos;
    storage.lastCursorPos = cursorPos;

    if (!transaction.docChanged) {
      if (cursorPos !== previousPos || !selection.empty) {
        discardSuggestion(storage, editor);
      }
      return;
    }

    const provider = this.options.provider;
    const typedByThisUser =
      !isChangeOrigin(transaction) && editor.view.hasFocus();

    if (!storage.enabled || !provider || !typedByThisUser) {
      discardSuggestion(storage, editor);
      return;
    }

    const typed = selection.empty
      ? textTypedAtCaret(transaction, previousPos, cursorPos)
      : null;

    if (typed !== null && remainingSuggestion(storage).startsWith(typed)) {
      clearDebounce(storage);
      storage.consumed += typed.length;
      redraw(editor);
      if (remainingSuggestion(storage) || storage.abortController) {
        return;
      }
    } else {
      discardSuggestion(storage, editor);
    }

    const contentBeforeCursor = doc.textBetween(0, cursorPos, '\n');
    if (contentBeforeCursor.length < this.options.minContentLength) {
      return;
    }

    const contentAfterCursor = doc.textBetween(
      cursorPos,
      doc.content.size,
      '\n'
    );

    if (this.options.isAIBusy?.()) {
      return;
    }

    storage.debounceTimer = setTimeout(() => {
      storage.debounceTimer = null;

      if (this.options.isAIBusy?.()) {
        return;
      }

      requestGhostSuggestion(
        contentBeforeCursor,
        contentAfterCursor,
        storage,
        editor,
        provider,
        this.options.onError
      );
    }, this.options.debounceMs);
  },

  onDestroy() {
    cancelPending(this.storage);
  },

  addProseMirrorPlugins() {
    const extensionStorage = this.storage;

    return [
      new Plugin({
        key: GhostTextPluginKey,
        props: {
          decorations(state) {
            const suggestion = remainingSuggestion(extensionStorage);
            if (!suggestion) {
              return DecorationSet.empty;
            }

            const pos = state.selection.to;
            const widget = Decoration.widget(
              pos,
              () => {
                const span = document.createElement('span');
                span.className = 'ghost-text-suggestion';
                span.textContent = suggestion;
                return span;
              },
              { side: 1, key: suggestion }
            );

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
