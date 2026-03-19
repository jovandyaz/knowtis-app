import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';

import {
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
} from '@knowtis/design-system';

import { filterSlashCommands } from './slash-commands.config';
import type { SlashCommandItem } from './slash-commands.config';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const GROUP_LABELS: Record<string, string> = {
  ai: 'ai.groups.ai',
  artifacts: 'ai.groups.artifacts',
  formatting: 'ai.groups.formatting',
};

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const { t } = useTranslation('notes');
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === 'Escape') {
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    const groups = items.reduce<{ group: string; items: SlashCommandItem[] }[]>(
      (acc, item) => {
        const existing = acc.find((g) => g.group === item.group);
        if (existing) {
          existing.items.push(item);
        } else {
          acc.push({ group: item.group, items: [item] });
        }
        return acc;
      },
      []
    );

    let globalIndex = 0;

    return (
      <CommandMenuContent width="lg">
        {groups.map((group, groupIdx) => {
          const isAI = group.group === 'ai' || group.group === 'artifacts';

          return (
            <CommandMenuGroup
              key={group.group}
              label={t(GROUP_LABELS[group.group] as never)}
              showSeparator={groupIdx > 0}
            >
              {group.items.map((item) => {
                const currentIndex = globalIndex++;
                const Icon = item.icon;

                return (
                  <CommandMenuItem
                    key={item.id}
                    icon={
                      <Icon
                        className={`h-4 w-4 ${isAI ? 'text-primary/70' : 'text-muted-foreground'}`}
                      />
                    }
                    label={t(item.labelKey as never)}
                    description={t(item.descriptionKey as never)}
                    selected={currentIndex === selectedIndex}
                    onClick={() => selectItem(currentIndex)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  />
                );
              })}
            </CommandMenuGroup>
          );
        })}
      </CommandMenuContent>
    );
  }
);

SlashCommandMenu.displayName = 'SlashCommandMenu';

/**
 * Suggestion configuration for the SlashCommands extension.
 * Handles item filtering, rendering via ReactRenderer + tippy.js,
 * and keyboard navigation delegation.
 */
export const slashCommandsSuggestion: Omit<
  SuggestionOptions<SlashCommandItem>,
  'editor'
> = {
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
