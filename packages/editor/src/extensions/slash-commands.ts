import { PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

const DEFAULT_SLASH_COMMANDS_PLUGIN_KEY = new PluginKey('slashCommands');

/**
 * Extension options. The host injects `suggestion`, which carries the
 * Tiptap suggestion config (items, render, command, etc.). The extension
 * itself is just plumbing — it does not know the shape of a command, only
 * that the host will provide one and route selection through the
 * suggestion contract.
 *
 * `I` (item shape) is kept unconstrained at the package boundary because
 * `SuggestionOptions<I>` is invariant in `I` (its `render` callbacks
 * consume `I`). Hosts pass their typed `Omit<SuggestionOptions<HostItem>,
 * 'editor'>` directly via `configure({ suggestion })` — TypeScript widens
 * `I` to `unknown` at the call site, but the runtime carries the
 * host-typed shape end-to-end.
 */
export interface SlashCommandsOptions {
  /**
   * Suggestion config (items, render, command, etc.). The host owns the
   * full menu rendering (React component) and per-item action callbacks
   * — the package never reaches into host stores or i18n.
   */
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

const DEFAULT_SUGGESTION: Omit<SuggestionOptions, 'editor'> = {
  char: '/',
  pluginKey: DEFAULT_SLASH_COMMANDS_PLUGIN_KEY,
  allowSpaces: false,
  startOfLine: false,
};

/**
 * Tiptap extension that wires up a slash-triggered suggestion menu.
 *
 * The package owns only the suggestion plumbing; the host (e.g.
 * `apps/notes`) provides items, the React renderer, and the per-item
 * action callbacks via `configure({ suggestion: ... })`. This keeps the
 * package free of app-level concerns (Zustand, i18n, routing).
 */
export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: DEFAULT_SUGGESTION,
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
