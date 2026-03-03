import { PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

const SlashCommandsPluginKey = new PluginKey('slashCommands');

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: SlashCommandsPluginKey,
        allowSpaces: false,
        startOfLine: false,
      } as Partial<SuggestionOptions>,
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
