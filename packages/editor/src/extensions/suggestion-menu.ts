import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

export interface SuggestionMenuOptions {
  /**
   * The host's `@tiptap/suggestion` config. `char` and `pluginKey` are
   * required because Tiptap's fallbacks, `@` and one key shared by every
   * suggestion plugin, would silently retarget the menu.
   */
  suggestion: Omit<SuggestionOptions, 'editor'> &
    Required<Pick<SuggestionOptions, 'char' | 'pluginKey'>>;
}

/**
 * Tiptap extension that wires up one character-triggered suggestion menu.
 *
 * The package owns only the suggestion plumbing; the host provides the
 * trigger, items, the React renderer and the per-item action callbacks via
 * `configure({ suggestion })`, keeping the package free of app-level
 * concerns (Zustand, i18n, routing). Register it once per trigger character
 * with a distinct name: `SuggestionMenu.extend({ name: 'tagSuggestions' })`.
 */
export const SuggestionMenu = Extension.create<SuggestionMenuOptions>({
  name: 'suggestionMenu',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
