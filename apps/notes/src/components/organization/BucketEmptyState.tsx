import { useTranslation } from 'react-i18next';

import { Inbox } from 'lucide-react';

import { EmptyState } from '@knowtis/design-system';
import type { BucketFilter } from '@knowtis/shared-types';

interface BucketEmptyStateProps {
  bucket: BucketFilter;
}

export function BucketEmptyState({ bucket }: BucketEmptyStateProps) {
  const { t } = useTranslation('notes');
  const isInbox = bucket === 'inbox';

  return (
    <EmptyState
      fullHeight={false}
      icon={
        isInbox ? (
          <Inbox className="h-8 w-8 text-muted-foreground" />
        ) : undefined
      }
      title={
        isInbox
          ? t('organization.empty.inboxTitle')
          : t('organization.empty.bucketTitle', {
              bucket: t(`organization.buckets.${bucket}`),
            })
      }
      description={
        isInbox
          ? t('organization.empty.inboxDescription')
          : t('organization.empty.bucketDescription')
      }
      className="rounded-2xl border border-dashed border-border bg-card/30 py-12"
    />
  );
}
