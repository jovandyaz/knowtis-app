import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Plus } from 'lucide-react';

import { useTags } from '@knowtis/data-access-notes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@knowtis/design-system';
import { TAG_MAX_DEPTH } from '@knowtis/shared-types';

import {
  isValidTagPath,
  matchTagPaths,
  normalizeTagPath,
} from './tag-input.utils';

const MAX_SUGGESTIONS = 8;

interface TagPickerProps {
  selected: string[];
  onAdd: (path: string) => void;
  triggerClassName: string;
}

export function TagPicker({
  selected,
  onAdd,
  triggerClassName,
}: TagPickerProps) {
  const { t } = useTranslation('notes');
  const { data: tags } = useTags();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

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

  const commit = (path: string) => {
    onAdd(path);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setQuery('');
        }
      }}
    >
      <DropdownMenuTrigger
        aria-label={t('organization.tags.addLabel')}
        className={triggerClassName}
      >
        <Plus className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('organization.tags.placeholder')}
          // Radix's typeahead would swallow these keys and move menu focus.
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && canCreate) {
              event.preventDefault();
              commit(typed);
            }
          }}
          className="h-9"
        />

        <div className="mt-1 flex flex-col">
          {suggestions.map((path) => (
            <DropdownMenuItem key={path} onSelect={() => commit(path)}>
              <Hash className="size-3 opacity-60" />
              <span className="flex-1 truncate">{path}</span>
            </DropdownMenuItem>
          ))}

          {canCreate && (
            <DropdownMenuItem onSelect={() => commit(typed)}>
              <Plus className="size-3 opacity-60" />
              <span className="flex-1 truncate">
                {t('organization.tags.create', { path: typed })}
              </span>
            </DropdownMenuItem>
          )}

          {!suggestions.length && !canCreate && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {query
                ? t('organization.tags.invalid', { depth: TAG_MAX_DEPTH })
                : t('organization.tags.empty')}
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
