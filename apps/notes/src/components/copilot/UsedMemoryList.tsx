import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { UsedMemory } from '@/stores/agent.store';

import { useMemories } from '@knowtis/data-access-agent';
import { Badge, Skeleton } from '@knowtis/design-system';
import type { UserMemoryItem } from '@knowtis/shared-types';

const VIEW = {
  TEXT: 'text',
  PENDING: 'pending',
  DELETED: 'deleted',
  UNAVAILABLE: 'unavailable',
} as const;

type UsedMemoryView =
  | { kind: typeof VIEW.TEXT; content: string; withheld: boolean }
  | {
      kind: typeof VIEW.PENDING | typeof VIEW.DELETED | typeof VIEW.UNAVAILABLE;
    };

function listedView(listed: UserMemoryItem): UsedMemoryView {
  return {
    kind: VIEW.TEXT,
    content: listed.content,
    withheld: listed.withheld,
  };
}

function viewOf(
  memory: UsedMemory,
  query: ReturnType<typeof useMemories>,
  openedAt: number
): UsedMemoryView {
  const listed = query.data?.find(({ id }) => id === memory.id);
  const readAfter = memory.live?.receivedAt ?? openedAt;
  if (query.data !== undefined && query.dataUpdatedAt >= readAfter) {
    return listed ? listedView(listed) : { kind: VIEW.DELETED };
  }
  if (memory.live) {
    return { kind: VIEW.TEXT, content: memory.live.content, withheld: false };
  }
  if (listed) {
    return listedView(listed);
  }
  return { kind: query.isError ? VIEW.UNAVAILABLE : VIEW.PENDING };
}

function UsedMemoryRow({ view }: { view: UsedMemoryView }) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');

  switch (view.kind) {
    case VIEW.TEXT:
      return (
        <li className="flex flex-col items-start gap-1 py-2">
          {view.withheld && (
            <Badge variant="warning">{tCommon('memory.withheld.badge')}</Badge>
          )}
          <p className="text-sm text-foreground wrap-anywhere">
            {view.content}
          </p>
        </li>
      );
    case VIEW.PENDING:
      return (
        <li className="py-2.5" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <span className="sr-only">{t('ai.copilot.memoryLoading')}</span>
        </li>
      );
    case VIEW.DELETED:
      return (
        <li className="py-2 text-sm italic text-muted-foreground">
          {t('ai.copilot.memoryDeleted')}
        </li>
      );
    case VIEW.UNAVAILABLE:
      return (
        <li className="py-2 text-sm text-muted-foreground">
          {t('ai.copilot.memoryUnavailable')}
        </li>
      );
    default: {
      const exhaustive: never = view;
      throw new Error(`Unhandled memory view: ${String(exhaustive)}`);
    }
  }
}

export function UsedMemoryList({
  memories,
}: {
  memories: readonly UsedMemory[];
}) {
  const [openedAt] = useState(Date.now);
  const query = useMemories();

  return (
    <ul className="divide-y divide-border/60 px-4">
      {memories.map((memory) => (
        <UsedMemoryRow key={memory.id} view={viewOf(memory, query, openedAt)} />
      ))}
    </ul>
  );
}
