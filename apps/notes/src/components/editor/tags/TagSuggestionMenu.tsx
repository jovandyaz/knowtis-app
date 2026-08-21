import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isValidTagPath,
  matchTagPaths,
  normalizeTagPath,
} from '@/components/organization/tag-input.utils';
import type { Editor, Range } from '@tiptap/react';
import { Hash, Plus } from 'lucide-react';

import { useNote, useTags, useUpdateNote } from '@knowtis/data-access-notes';
import {
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
} from '@knowtis/design-system';
import { TAG_MAX_DEPTH } from '@knowtis/shared-types';

const MAX_SUGGESTIONS = 8;

export interface TagSuggestionMenuProps {
  noteId: string;
  query: string;
  range: Range;
  editor: Editor;
}

export interface TagSuggestionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const TagSuggestionMenu = forwardRef<
  TagSuggestionMenuRef,
  TagSuggestionMenuProps
>(({ noteId, query, range, editor }, ref) => {
  const { t } = useTranslation('notes');
  const { data: tags } = useTags();
  const { data: note } = useNote(noteId);
  const { mutate: updateNote } = useUpdateNote();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = note?.tags ?? [];
  const vocabulary = (tags ?? [])
    .map((tag) => tag.path)
    .filter((path) => !selected.includes(path));
  const suggestions = matchTagPaths(vocabulary, query).slice(
    0,
    MAX_SUGGESTIONS
  );

  const typed = normalizeTagPath(query);
  const canCreate =
    isValidTagPath(query) &&
    !selected.includes(typed) &&
    !suggestions.includes(typed);

  const options = canCreate ? [...suggestions, typed] : suggestions;

  const [queriedFor, setQueriedFor] = useState(query);
  if (queriedFor !== query) {
    setQueriedFor(query);
    setSelectedIndex(0);
  }

  // The typed text is an input method, not content: it leaves the document
  // and the tag lands in note_tags, so tags keep exactly one home.
  const commit = (path: string) => {
    editor.chain().focus().deleteRange(range).run();
    updateNote({ id: noteId, input: { tags: [...selected, path] } });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev >= options.length - 1 ? 0 : prev + 1));
        return true;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const path = options[selectedIndex];
        if (!path) {
          return false;
        }
        event.preventDefault();
        commit(path);
        return true;
      }

      return event.key === 'Escape';
    },
  }));

  return (
    <CommandMenuContent width="sm">
      <CommandMenuGroup label={t('organization.tags.suggestionTitle')}>
        {suggestions.map((path, index) => (
          <CommandMenuItem
            key={path}
            icon={<Hash className="h-4 w-4 text-muted-foreground" />}
            label={path}
            selected={index === selectedIndex}
            onClick={() => commit(path)}
            onMouseEnter={() => setSelectedIndex(index)}
          />
        ))}

        {canCreate && (
          <CommandMenuItem
            icon={<Plus className="h-4 w-4 text-muted-foreground" />}
            label={t('organization.tags.create', { path: typed })}
            selected={selectedIndex === options.length - 1}
            onClick={() => commit(typed)}
            onMouseEnter={() => setSelectedIndex(options.length - 1)}
          />
        )}

        {options.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {query
              ? t('organization.tags.invalid', { depth: TAG_MAX_DEPTH })
              : t('organization.tags.empty')}
          </p>
        )}
      </CommandMenuGroup>
    </CommandMenuContent>
  );
});

TagSuggestionMenu.displayName = 'TagSuggestionMenu';
