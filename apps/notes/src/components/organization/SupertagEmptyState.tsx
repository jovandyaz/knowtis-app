import { useTranslation } from 'react-i18next';

import { Shapes } from 'lucide-react';

import { EmptyState } from '@knowtis/design-system';
import type { Supertag } from '@knowtis/shared-types';

interface SupertagEmptyStateProps {
  supertag: Supertag;
}

export function SupertagEmptyState({ supertag }: SupertagEmptyStateProps) {
  const { t } = useTranslation('notes');
  const type = t(`organization.supertags.names.${supertag}`);

  return (
    <EmptyState
      fullHeight={false}
      icon={<Shapes className="h-8 w-8 text-muted-foreground" />}
      title={t('organization.supertags.emptyTitle', { type })}
      description={t('organization.supertags.emptyDescription')}
      className="rounded-2xl border border-dashed border-border bg-card/30 py-12"
    />
  );
}
