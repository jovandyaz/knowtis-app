import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';

import {
  TagSuggestionMenu,
  type TagSuggestionMenuRef,
} from './TagSuggestionMenu';

const TAG_SUGGESTION_PLUGIN_KEY = new PluginKey('tagSuggestions');

/**
 * Suggestion config for the `#` menu, bound to the note whose tag set it
 * writes. Register it through `SuggestionMenu.extend({ name })`.
 */
export function createTagSuggestion(
  noteId: string
): Omit<SuggestionOptions, 'editor'> {
  return {
    char: '#',
    pluginKey: TAG_SUGGESTION_PLUGIN_KEY,
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }) => [query],

    render: () => {
      let component: ReactRenderer<TagSuggestionMenuRef> | null = null;
      let popup: TippyInstance[] | null = null;

      const menuProps = (props: SuggestionProps) => ({
        noteId,
        query: props.query,
        range: props.range,
        editor: props.editor,
      });

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(TagSuggestionMenu, {
            props: menuProps(props),
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

        onUpdate: (props: SuggestionProps) => {
          component?.updateProps(menuProps(props));

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
  };
}
