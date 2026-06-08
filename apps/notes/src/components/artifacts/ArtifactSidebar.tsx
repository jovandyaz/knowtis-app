import { useTranslation } from 'react-i18next';

import { useRightDockStore } from '@/stores/right-dock.store';
import { PanelLeft, Sparkles } from 'lucide-react';

export function ArtifactSidebarToggle() {
  const { t } = useTranslation('notes');
  const isOpen = useRightDockStore((s) => s.isOpen);
  const activeTab = useRightDockStore((s) => s.activeTab);
  const toggle = useRightDockStore((s) => s.toggle);
  const open = isOpen && activeTab === 'estudio';

  return (
    <button
      type="button"
      onClick={() => toggle('estudio')}
      className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
      aria-label={
        open
          ? t('ai.artifacts.sidebar.closePanel')
          : t('ai.artifacts.sidebar.openPanel')
      }
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
      onClick={() => open('copilot')}
      className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
      aria-label={t('labels.copilot', 'Copilot')}
    >
      <Sparkles className="h-5 w-5" />
    </button>
  );
}
