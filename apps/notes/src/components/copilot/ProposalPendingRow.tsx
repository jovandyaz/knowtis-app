import { useTranslation } from 'react-i18next';

import { PencilLine } from 'lucide-react';

import { Button } from '@knowtis/design-system';

export function ProposalPendingRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('notes');

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
      <PencilLine className="size-3.5 shrink-0 text-primary" />
      <span className="truncate text-foreground">
        {t('ai.copilot.review.pendingRow')}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="ml-auto h-6 px-2 text-xs"
        onClick={onOpen}
      >
        {t('ai.copilot.review.pendingReview')}
      </Button>
    </div>
  );
}
