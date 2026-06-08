import { useTranslation } from 'react-i18next';

import { Sparkles } from 'lucide-react';

export function AgentEmptyState() {
  const { t } = useTranslation('notes');
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Sparkles className="h-7 w-7 text-primary/50" />
      <p className="mt-3 text-sm font-medium text-foreground">
        {t('ai.copilot.empty.title')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('ai.copilot.empty.suggestions')}
      </p>
    </div>
  );
}
