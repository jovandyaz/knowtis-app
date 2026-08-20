import { useTranslation } from 'react-i18next';

import { Users } from 'lucide-react';

import { EmptyState } from '@knowtis/design-system';
import type { NoteListView } from '@knowtis/shared-types';

interface ViewEmptyStateProps {
  view: Exclude<NoteListView, 'all'>;
}

export function ViewEmptyState({ view }: ViewEmptyStateProps) {
  const { t } = useTranslation('notes');

  return (
    <EmptyState
      fullHeight={false}
      icon={
        view === 'shared' ? (
          <Users className="h-8 w-8 text-muted-foreground" />
        ) : undefined
      }
      title={t(`organization.empty.${view}Title`)}
      description={t(`organization.empty.${view}Description`)}
      className="rounded-2xl border border-dashed border-border bg-card/30 py-12"
    />
  );
}
