import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

/**
 * Extension options. The host injects `suggestion`, which carries the
 * Tiptap suggestion config (char, pluginKey, items, render, command).
 * The extension itself is just plumbing — it does not know the shape of an
 * item, only that the host will provide one and route selection through the
 * suggestion contract.
 *
 * `I` (item shape) is kept unconstrained at the package boundary because
 * `SuggestionOptions<I>` is invariant in `I` (its `render` callbacks
 * consume `I`). Hosts pass their typed `Omit<SuggestionOptions<HostItem>,
 * 'editor'>` directly via `configure({ suggestion })` — TypeScript widens
 * `I` to `unknown` at the call site, but the runtime carries the
 * host-typed shape end-to-end.
 */
export interface SuggestionMenuOptions {
  /**
   * Suggestion config. Must set `char` and a `pluginKey` unique to this
   * instance: Tiptap deep-merges `configure` over the defaults, and two
   * menus sharing a plugin key would fight over the same ProseMirror state.
   */
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

/**
 * Tiptap extension that wires up one character-triggered suggestion menu.
 *
 * The package owns only the suggestion plumbing; the host provides items,
 * the React renderer and the per-item action callbacks via
 * `configure({ suggestion })`, keeping the package free of app-level
 * concerns (Zustand, i18n, routing). Register it once per trigger character
 * with a distinct name: `SuggestionMenu.extend({ name: 'tagSuggestions' })`.
 */
export const SuggestionMenu = Extension.create<SuggestionMenuOptions>({
  name: 'suggestionMenu',

  addOptions() {
    return {
      suggestion: { allowSpaces: false, startOfLine: false },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
