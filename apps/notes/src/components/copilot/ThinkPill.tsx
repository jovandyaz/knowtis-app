import { useTranslation } from 'react-i18next';

import { Brain } from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';

interface ThinkPillProps {
  active: boolean;
  onToggle: () => void;
  hidden: boolean;
}

/** Per-message reasoning boost for free registered users; BYOK effort lives in the model menu instead. */
export function ThinkPill({ active, onToggle, hidden }: ThinkPillProps) {
  const { t } = useTranslation('common');

  if (hidden) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={active}
      title={t('aiAssistant.thinkHint')}
      onClick={onToggle}
      className={cn(
        'h-8 gap-1 px-2 text-xs',
        active
          ? 'bg-(--secondary) text-(--secondary-foreground)'
          : 'text-(--muted-foreground)'
      )}
    >
      <Brain className="h-3.5 w-3.5" />
      {t('aiAssistant.think')}
    </Button>
  );
}
