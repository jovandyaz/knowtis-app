import { useTranslation } from 'react-i18next';

import { useRightDockStore } from '@/stores/right-dock.store';
import { PanelLeft, Sparkles } from 'lucide-react';

export function RightDockToggle() {
  const { t } = useTranslation('common');
  const isOpen = useRightDockStore((s) => s.isOpen);
  const toggle = useRightDockStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isOpen}
      aria-label={t('labels.copilot', 'Copilot')}
      className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
    >
      <PanelLeft className="h-4 w-4 -scale-x-100" />
    </button>
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
