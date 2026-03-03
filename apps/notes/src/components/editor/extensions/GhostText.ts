import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/react';

import { aiClient, type AIStreamHandle } from '@knowtis/api-client';
import { AI_ACTION } from '@knowtis/shared-types';

const GhostTextPluginKey = new PluginKey('ghostText');

interface GhostTextOptions {
  debounceMs: number;
  minContentLength: number;
  enabled: boolean;
  isAIBusy?: () => boolean;
}

interface GhostTextStorage {
  suggestion: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  streamHandle: AIStreamHandle | null;
  lastCursorPos: number;
  lastChangeWasTyping: boolean;
}

function requestGhostSuggestion(
  content: string,
  suffix: string,
  storage: GhostTextStorage,
  editor: {
    view: { dispatch: (tr: Transaction) => void };
    state: { tr: Transaction };
  }
): void {
  let chunks = '';

  const handle = aiClient.stream(
    { action: AI_ACTION.GHOST_TEXT, content, ...(suffix && { suffix }) },
    {
      onChunk: ({ text }) => {
        chunks += text;
        storage.suggestion = chunks;
        editor.view.dispatch(editor.state.tr);
      },
      onDone: () => {
        storage.streamHandle = null;
      },
      onError: () => {
        storage.suggestion = '';
        storage.streamHandle = null;
      },
    }
  );

  storage.streamHandle = handle;
}

export const GhostText = Extension.create<GhostTextOptions, GhostTextStorage>({
  name: 'ghostText',

  addOptions() {
    return {
      debounceMs: 750,
      minContentLength: 20,
      enabled: true,
    } as GhostTextOptions;
  },

  addStorage() {
    return {
      suggestion: '',
      debounceTimer: null,
      streamHandle: null,
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
      if (this.storage.streamHandle) {
        this.storage.streamHandle.cancel();
        this.storage.streamHandle = null;
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

    this.storage.lastChangeWasTyping = true;
    this.storage.lastCursorPos = this.editor.state.selection.from;
    this.storage.suggestion = '';

    if (this.storage.debounceTimer) {
      clearTimeout(this.storage.debounceTimer);
      this.storage.debounceTimer = null;
    }

    if (this.storage.streamHandle) {
      this.storage.streamHandle.cancel();
      this.storage.streamHandle = null;
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
        this.editor
      );
    }, this.options.debounceMs);
  },

  onDestroy() {
    if (this.storage.debounceTimer) {
      clearTimeout(this.storage.debounceTimer);
      this.storage.debounceTimer = null;
    }

    if (this.storage.streamHandle) {
      this.storage.streamHandle.cancel();
      this.storage.streamHandle = null;
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
