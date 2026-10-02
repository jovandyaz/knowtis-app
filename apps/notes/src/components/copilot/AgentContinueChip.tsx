import { useTranslation } from 'react-i18next';

import { CornerDownRight } from 'lucide-react';

export function AgentContinueChip() {
  const { t } = useTranslation('notes');

  return (
    <span className="ml-auto inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      <CornerDownRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t('ai.copilot.continue.marker')}
    </span>
  );
}
