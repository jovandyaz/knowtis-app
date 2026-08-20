import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import { useUpdateNote } from '@knowtis/data-access-notes';
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
  type ParaBucket,
} from '@knowtis/shared-types';

import { BucketDot } from './BucketDot';

const CHIP_CLASSES =
  'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-[13px] text-muted-foreground';

function isParaBucket(value: string): value is ParaBucket {
  return (PARA_BUCKETS as readonly string[]).includes(value);
}

interface NotePropertiesRowProps {
  noteId: string;
  bucket: ParaBucket | null;
  isOwner: boolean;
}

export function NotePropertiesRow({
  noteId,
  bucket,
  isOwner,
}: NotePropertiesRowProps) {
  const { t } = useTranslation('notes');
  const { mutate: updateNote } = useUpdateNote();
  const activeFilter = bucket ?? INBOX_FILTER;
  const label = t(`organization.buckets.${activeFilter}`);

  if (!isOwner) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className={CHIP_CLASSES}>
          <BucketDot bucket={activeFilter} />
          {label}
        </span>
      </div>
    );
  }

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
    <div className="mt-3 flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`${CHIP_CLASSES} cursor-pointer transition-colors hover:bg-muted/40`}
        >
          <BucketDot bucket={activeFilter} />
          {label}
          <ChevronDown className="h-3 w-3 opacity-70" />
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
    </div>
  );
}
