import { useTranslation } from 'react-i18next';

export function AgentStatusIndicator() {
  const { t } = useTranslation('notes');
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      {t('ai.copilot.thinking')}
    </div>
  );
}
