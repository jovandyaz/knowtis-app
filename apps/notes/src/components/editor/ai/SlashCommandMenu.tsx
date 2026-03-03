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

import { cn } from '@knowtis/design-system';

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

    // Group items by their group property while preserving order
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
      <div
        className={cn(
          'z-50 w-64 overflow-hidden rounded-xl border border-border',
          'bg-card shadow-lg backdrop-blur-md',
          'animate-in fade-in slide-in-from-top-2 duration-200'
        )}
      >
        <div className="max-h-72 overflow-y-auto p-1.5">
          {groups.map((group, groupIdx) => (
            <div key={group.group}>
              {groupIdx > 0 && (
                <div className="mx-2 my-1.5 border-t border-border" />
              )}
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(GROUP_LABELS[group.group] as never)}
              </div>
              {group.items.map((item) => {
                const currentIndex = globalIndex++;
                const Icon = item.icon;
                const isSelected = currentIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left',
                      'transition-colors duration-100',
                      isSelected
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted'
                    )}
                    onClick={() => selectItem(currentIndex)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                        isSelected
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {t(item.labelKey as never)}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {t(item.descriptionKey as never)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
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
