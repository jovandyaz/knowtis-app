import { useTranslation } from 'react-i18next';

import { useRightDockStore } from '@/stores/right-dock.store';
import { PanelLeft, Sparkles } from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';

export function RightDockToggle() {
  const { t } = useTranslation('common');
  const isOpen = useRightDockStore((s) => s.isOpen);
  const toggle = useRightDockStore((s) => s.toggle);

  return (
    <Button
      id="right-dock-toggle"
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={isOpen}
      aria-label={t('labels.copilot', 'Copilot')}
      className={cn(
        'text-muted-foreground hover:text-foreground',
        isOpen && 'bg-muted text-foreground'
      )}
    >
      <PanelLeft className="h-4 w-4 -scale-x-100" />
    </Button>
  );
}

export function CopilotMobileFAB() {
  const { t } = useTranslation('common');
  const open = useRightDockStore((s) => s.open);

  return (
    <button
      type="button"
      onClick={() => open()}
      className="flex size-12 items-center justify-center rounded-full border border-(--border) bg-(--card) text-(--primary) shadow-lg transition-transform active:scale-95"
      aria-label={t('labels.copilot', 'Copilot')}
    >
      <Sparkles className="size-5" />
    </button>
  );
}
