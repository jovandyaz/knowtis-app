import { useTranslation } from 'react-i18next';

import { Sparkles } from 'lucide-react';

import { AgentCapabilityRows } from './AgentCapabilityRows';

export function AgentEmptyState({
  onSelectSuggestion,
}: {
  onSelectSuggestion: (prompt: string) => void;
}) {
  const { t } = useTranslation('notes');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </span>
        <p className="text-sm font-medium text-foreground">
          {t('ai.copilot.empty.title')}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t('ai.copilot.empty.greeting')}
        </p>
      </div>
      <AgentCapabilityRows onSelect={onSelectSuggestion} />
    </div>
  );
}
