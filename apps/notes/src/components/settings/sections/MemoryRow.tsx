import { useId, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { formatDate } from '@/lib/format-date';
import { Pencil, Trash2, type LucideIcon } from 'lucide-react';

import {
  Badge,
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import type { UserMemoryItem, UserMemorySource } from '@knowtis/shared-types';

import { MemoryEditForm } from './MemoryEditForm';

interface RowActionProps {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  tooltip: string;
  icon: LucideIcon;
  describedBy: string;
  onClick: () => void;
  className?: string;
}

function RowAction({
  ref,
  label,
  tooltip,
  icon: Icon,
  describedBy,
  onClick,
  className,
}: RowActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-describedby={describedBy}
          onClick={onClick}
          className={cn('text-(--muted-foreground)', className)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface MemorySourceLabelProps {
  source: UserMemorySource | null;
  onOpen: ((conversationId: string) => void) | null;
}

function MemorySourceLabel({ source, onOpen }: MemorySourceLabelProps) {
  const { t } = useTranslation('common');
  const { t: tNotes } = useTranslation('notes');

  if (!source) {
    return <span>{t('memory.sourceDeleted')}</span>;
  }
  const label = t('memory.source', {
    title: source.title || tNotes('ai.copilot.history.untitled'),
  });
  if (!onOpen) {
    return <span className="min-w-0 truncate">{label}</span>;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onOpen(source.conversationId)}
      className="-mx-1.5 h-6 min-w-0 max-w-full px-1.5 text-xs font-normal text-(--muted-foreground) hover:text-(--foreground)"
    >
      <span className="truncate">{label}</span>
    </Button>
  );
}

interface MemoryRowProps {
  memory: UserMemoryItem;
  onForget: (memory: UserMemoryItem) => void;
  onOpenSource: ((conversationId: string) => void) | null;
}

export function MemoryRow({ memory, onForget, onOpenSource }: MemoryRowProps) {
  const { t, i18n } = useTranslation('common');
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const edited = Date.parse(memory.updatedAt) > Date.parse(memory.createdAt);
  const stamp = edited ? memory.updatedAt : memory.createdAt;

  const stopEditing = () => {
    flushSync(() => setEditing(false));
    editButtonRef.current?.focus();
  };

  return (
    <li className="px-4 py-3">
      {editing ? (
        <MemoryEditForm memory={memory} onClose={stopEditing} />
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            {memory.withheld ? (
              <Badge variant="warning">{t('memory.withheld.badge')}</Badge>
            ) : null}
            <p
              id={contentId}
              className="text-sm text-(--foreground) wrap-anywhere"
            >
              {memory.content}
            </p>
            {memory.withheld ? (
              <p className="text-xs text-(--muted-foreground)">
                {t('memory.withheld.explanation')}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--muted-foreground)">
              <time dateTime={stamp}>
                {t(edited ? 'memory.updated' : 'memory.saved', {
                  date: formatDate(stamp, i18n.language),
                })}
              </time>
              <MemorySourceLabel source={memory.source} onOpen={onOpenSource} />
            </div>
          </div>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center">
            <RowAction
              ref={editButtonRef}
              label={t('memory.editLabel')}
              tooltip={t('memory.editTooltip')}
              icon={Pencil}
              describedBy={contentId}
              onClick={() => setEditing(true)}
            />
            <RowAction
              label={t('memory.forgetLabel')}
              tooltip={t('memory.forgetTooltip')}
              icon={Trash2}
              describedBy={contentId}
              onClick={() => onForget(memory)}
              className="hover:text-(--destructive)"
            />
          </div>
        </div>
      )}
    </li>
  );
}
