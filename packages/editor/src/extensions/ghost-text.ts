import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/react';

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
  /** Master enable flag; when false, the extension does nothing. */
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
  suggestion: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  abortController: AbortController | null;
  lastCursorPos: number;
  lastChangeWasTyping: boolean;
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
      storage.suggestion = chunks;
      editor.view.dispatch(editor.state.tr);
    }
  } catch (error) {
    if (input.signal.aborted) {
      return;
    }

    onError?.(error);
    storage.suggestion = '';
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

  addStorage() {
    return {
      suggestion: '',
      debounceTimer: null,
      abortController: null,
      lastCursorPos: 0,
      lastChangeWasTyping: false,
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const suggestion = this.storage.suggestion;
        if (!suggestion) {
          return false;
        }

        editor.chain().focus().insertContent(suggestion).run();
        this.options.onAccept?.(suggestion);
        this.storage.suggestion = '';
        return true;
      },
      Escape: () => {
        if (!this.storage.suggestion) {
          return false;
        }

        this.storage.suggestion = '';
        this.editor.view.dispatch(this.editor.state.tr);
        return true;
      },
    };
  },

  onSelectionUpdate() {
    const { from, to } = this.editor.state.selection;
    const cursorPos = from;

    if (cursorPos !== this.storage.lastCursorPos || from !== to) {
      if (this.storage.suggestion) {
        this.storage.suggestion = '';
        this.editor.view.dispatch(this.editor.state.tr);
      }
      if (this.storage.abortController) {
        this.storage.abortController.abort();
        this.storage.abortController = null;
      }
      if (this.storage.debounceTimer) {
        clearTimeout(this.storage.debounceTimer);
        this.storage.debounceTimer = null;
      }
    }

    this.storage.lastCursorPos = cursorPos;
    this.storage.lastChangeWasTyping = false;
  },

  onUpdate() {
    if (!this.options.enabled) {
      return;
    }

    const provider = this.options.provider;
    if (!provider) {
      return;
    }

    this.storage.lastChangeWasTyping = true;
    this.storage.lastCursorPos = this.editor.state.selection.from;
    this.storage.suggestion = '';

    if (this.storage.debounceTimer) {
      clearTimeout(this.storage.debounceTimer);
      this.storage.debounceTimer = null;
    }

    if (this.storage.abortController) {
      this.storage.abortController.abort();
      this.storage.abortController = null;
    }

    const cursorPos = this.editor.state.selection.from;
    const doc = this.editor.state.doc;
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

    this.storage.debounceTimer = setTimeout(() => {
      if (this.options.isAIBusy?.()) {
        return;
      }

      if (!this.storage.lastChangeWasTyping) {
        return;
      }

      requestGhostSuggestion(
        contentBeforeCursor,
        contentAfterCursor,
        this.storage,
        this.editor,
        provider,
        this.options.onError
      );
    }, this.options.debounceMs);
  },

  onDestroy() {
    if (this.storage.debounceTimer) {
      clearTimeout(this.storage.debounceTimer);
      this.storage.debounceTimer = null;
    }

    if (this.storage.abortController) {
      this.storage.abortController.abort();
      this.storage.abortController = null;
    }
  },

  addProseMirrorPlugins() {
    const extensionStorage = this.storage;

    return [
      new Plugin({
        key: GhostTextPluginKey,
        props: {
          decorations(state) {
            const suggestion = extensionStorage.suggestion;
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
              { side: 1 }
            );

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
