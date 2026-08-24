import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Hash, Shapes, Sparkles, X } from 'lucide-react';

import { useSupertagCatalog, useUpdateNote } from '@knowtis/data-access-notes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import {
  INBOX_FILTER,
  PARA_BUCKETS,
  SUPERTAGS,
  type ParaBucket,
  type Supertag,
  type SupertagFields,
} from '@knowtis/shared-types';

import { BucketDot } from './BucketDot';
import { SupertagFieldsForm } from './SupertagFieldsForm';
import { TagPicker } from './TagPicker';

const CHIP_CLASSES =
  'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-[13px] text-muted-foreground';

// The chips describe the note, so they sit close under its title; the editor
// toolbar below is `sticky top-0` and would otherwise start flush against them.
const ROW_CLASSES = 'mt-1 mb-6 flex flex-wrap items-center gap-2';

const NO_SUPERTAG = 'none';

function isParaBucket(value: string): value is ParaBucket {
  return (PARA_BUCKETS as readonly string[]).includes(value);
}

function isSupertag(value: string): value is Supertag {
  return (SUPERTAGS as readonly string[]).includes(value);
}

interface NotePropertiesRowProps {
  noteId: string;
  bucket: ParaBucket | null;
  tags: string[];
  supertag: Supertag | null;
  supertagFields: SupertagFields | null;
  isOwner: boolean;
  onSuggest?: () => void;
  isSuggesting?: boolean;
}

export function NotePropertiesRow({
  noteId,
  bucket,
  tags,
  supertag,
  supertagFields,
  isOwner,
  onSuggest,
  isSuggesting = false,
}: NotePropertiesRowProps) {
  const { t } = useTranslation('notes');
  const { mutate: updateNote } = useUpdateNote();
  const { data: catalog } = useSupertagCatalog();
  const [pendingSupertag, setPendingSupertag] = useState<Supertag | null>(null);
  const editingSupertag = pendingSupertag ?? supertag;
  const activeFilter = bucket ?? INBOX_FILTER;
  const label = t(`organization.buckets.${activeFilter}`);

  if (!isOwner) {
    return (
      <div className={ROW_CLASSES}>
        <span className={CHIP_CLASSES}>
          <BucketDot bucket={activeFilter} />
          {label}
        </span>
        {supertag && (
          <span className={CHIP_CLASSES}>
            <Shapes className="size-3 opacity-60" />
            {t(`organization.supertags.names.${supertag}`)}
          </span>
        )}
        {tags.map((path) => (
          <span key={path} className={CHIP_CLASSES}>
            <Hash className="size-3 opacity-60" />
            {path}
          </span>
        ))}
      </div>
    );
  }

  const setTags = (next: string[]) =>
    updateNote({ id: noteId, input: { tags: next } });

  const setSupertag = (next: Supertag | null) => {
    if (next === supertag) {
      return;
    }
    if (next === null) {
      setPendingSupertag(null);
      updateNote({ id: noteId, input: { supertag: null } });
      return;
    }
    // A type only persists once its required fields are filled, so picking one
    // opens the form instead of writing an assignment the API would reject.
    setPendingSupertag(next);
  };

  const saveSupertagFields = (values: SupertagFields) => {
    if (!editingSupertag) {
      return;
    }
    updateNote({
      id: noteId,
      input: { supertag: editingSupertag, supertagFields: values },
    });
    setPendingSupertag(null);
  };

  const setBucket = (next: ParaBucket | null) => {
    if (next === bucket) {
      return;
    }
    updateNote({ id: noteId, input: { bucket: next } });
  };

  const handleValueChange = (value: string) => {
    setBucket(isParaBucket(value) ? value : null);
  };

  return (
    <div className={ROW_CLASSES}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`${CHIP_CLASSES} min-h-11 cursor-pointer transition-colors hover:bg-muted/40 md:min-h-0`}
        >
          <BucketDot bucket={activeFilter} />
          {label}
          <ChevronDown className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={activeFilter}
            onValueChange={handleValueChange}
          >
            <DropdownMenuRadioItem value={INBOX_FILTER}>
              <BucketDot bucket={INBOX_FILTER} />
              <span className="flex-1">{t('organization.buckets.inbox')}</span>
            </DropdownMenuRadioItem>
            {PARA_BUCKETS.map((b) => (
              <DropdownMenuRadioItem key={b} value={b}>
                <BucketDot bucket={b} />
                <span className="flex-1">{t(`organization.buckets.${b}`)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {tags.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => setTags(tags.filter((current) => current !== path))}
          aria-label={t('organization.tags.remove', { path })}
          className={`${CHIP_CLASSES} min-h-11 cursor-pointer transition-colors hover:bg-muted/40 md:min-h-0`}
        >
          <Hash className="size-3 opacity-60" />
          {path}
          <X className="size-3 opacity-70" />
        </button>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('organization.supertags.label')}
          className={`${CHIP_CLASSES} min-h-11 cursor-pointer transition-colors hover:bg-muted/40 md:min-h-0`}
        >
          <Shapes className="size-3 opacity-60" />
          {supertag
            ? t(`organization.supertags.names.${supertag}`)
            : t('organization.supertags.none')}
          <ChevronDown className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={supertag ?? NO_SUPERTAG}
            onValueChange={(value) =>
              setSupertag(isSupertag(value) ? value : null)
            }
          >
            <DropdownMenuRadioItem value={NO_SUPERTAG}>
              <span className="flex-1">{t('organization.supertags.none')}</span>
            </DropdownMenuRadioItem>
            {SUPERTAGS.map((type) => (
              <DropdownMenuRadioItem key={type} value={type}>
                <span className="flex-1">
                  {t(`organization.supertags.names.${type}`)}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <TagPicker
        selected={tags}
        onAdd={(path) => setTags([...tags, path])}
        triggerClassName={`${CHIP_CLASSES} min-h-11 cursor-pointer transition-colors hover:bg-muted/40 md:min-h-0`}
      />

      {onSuggest && (
        <button
          type="button"
          onClick={() => onSuggest()}
          disabled={isSuggesting}
          aria-busy={isSuggesting}
          className={`${CHIP_CLASSES} min-h-11 cursor-pointer transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-60 md:min-h-0`}
        >
          <Sparkles className="size-3 opacity-70" />
          {isSuggesting
            ? t('organization.suggestion.pending')
            : t('organization.suggestion.ask')}
        </button>
      )}

      {editingSupertag && catalog && (
        <SupertagFieldsForm
          key={editingSupertag}
          supertag={editingSupertag}
          fields={catalog[editingSupertag]}
          values={editingSupertag === supertag ? supertagFields : null}
          onSave={saveSupertagFields}
          onCancel={() => setPendingSupertag(null)}
        />
      )}
    </div>
  );
}
