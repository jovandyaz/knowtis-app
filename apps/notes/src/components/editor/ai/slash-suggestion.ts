import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/react';
import type { SuggestionProps } from '@tiptap/suggestion';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';

import type { SuggestionMenuOptions } from '@knowtis/editor';

import { filterSlashCommands } from './slash-commands.config';
import type { SlashCommandItem } from './slash-commands.config';
import { SlashCommandMenu, type SlashCommandMenuRef } from './SlashCommandMenu';

const SLASH_COMMANDS_PLUGIN_KEY = new PluginKey('slashCommands');

/**
 * Suggestion config for the `/` menu: item filtering, rendering via
 * ReactRenderer + tippy.js, and keyboard navigation delegation. Register it
 * through `SuggestionMenu.extend({ name })`.
 */
export const slashCommandsSuggestion: SuggestionMenuOptions['suggestion'] = {
  char: '/',
  pluginKey: SLASH_COMMANDS_PLUGIN_KEY,
  allowSpaces: false,
  startOfLine: false,

  items: ({ query }) => filterSlashCommands(query),

  render: () => {
    let component: ReactRenderer<SlashCommandMenuRef> | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props: SuggestionProps<SlashCommandItem>) => {
        component = new ReactRenderer(SlashCommandMenu, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          zIndex: 50,
        });
      },

      onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
        component?.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },

      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide();
          return true;
        }

        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  },

  command: ({
    editor,
    range,
    props,
  }: {
    editor: Editor;
    range: Range;
    props: SlashCommandItem;
  }) => {
    props.action(editor, range);
  },
};
