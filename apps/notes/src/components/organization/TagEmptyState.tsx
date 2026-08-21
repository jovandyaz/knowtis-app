import { useTranslation } from 'react-i18next';

import { Hash } from 'lucide-react';

import { EmptyState } from '@knowtis/design-system';

interface TagEmptyStateProps {
  tag: string;
}

export function TagEmptyState({ tag }: TagEmptyStateProps) {
  const { t } = useTranslation('notes');

  return (
    <EmptyState
      fullHeight={false}
      icon={<Hash className="h-8 w-8 text-muted-foreground" />}
      title={t('organization.tags.emptyTitle', { tag })}
      description={t('organization.tags.emptyDescription')}
      className="rounded-2xl border border-dashed border-border bg-card/30 py-12"
    />
  );
}
