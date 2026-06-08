import { useTranslation } from 'react-i18next';

import {
  useRightDockStore,
  type RightDockTab,
} from '@/stores/right-dock.store';
import { BookOpen, Sparkles } from 'lucide-react';

import {
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ResizablePanel,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';

import { AgentCopilotPanel } from '../copilot';
import { StudyToolsTab } from './StudyToolsTab';

const DOCK_DEFAULT_WIDTH = 360;
const DOCK_MIN_WIDTH = 300;
const DOCK_MAX_WIDTH = 500;
const DOCK_COLLAPSE_THRESHOLD = 240;

function TabBar() {
  const { t } = useTranslation('notes');
  const activeTab = useRightDockStore((s) => s.activeTab);
  const setTab = useRightDockStore((s) => s.setTab);

  const tabs: { key: RightDockTab; label: string; icon: typeof Sparkles }[] = [
    { key: 'copilot', label: t('ai.copilot.tab'), icon: Sparkles },
    { key: 'estudio', label: t('ai.artifacts.studyTools'), icon: BookOpen },
  ];

  return (
    <div
      role="tablist"
      aria-label={t('ai.copilot.dockLabel')}
      className="flex items-center border-b border-border"
    >
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          id={`right-dock-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={activeTab === key}
          aria-controls={`right-dock-panel-${key}`}
          onClick={() => setTab(key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === key
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function DockBody({ noteId }: { noteId: string | null }) {
  const activeTab = useRightDockStore((s) => s.activeTab);
  return (
    <div className="flex h-full flex-col min-w-0">
      <TabBar />
      <div
        id="right-dock-panel-copilot"
        role="tabpanel"
        aria-labelledby="right-dock-tab-copilot"
        className={cn(
          'flex-1 overflow-hidden min-h-0',
          activeTab !== 'copilot' && 'hidden'
        )}
      >
        <AgentCopilotPanel />
      </div>
      <div
        id="right-dock-panel-estudio"
        role="tabpanel"
        aria-labelledby="right-dock-tab-estudio"
        className={cn(
          'flex-1 min-h-0 overflow-y-auto',
          activeTab !== 'estudio' && 'hidden'
        )}
      >
        <StudyToolsTab noteId={noteId} />
      </div>
    </div>
  );
}

export function RightDock({ noteId }: { noteId: string | null }) {
  const { t } = useTranslation('notes');
  const isOpen = useRightDockStore((s) => s.isOpen);
  const activeTab = useRightDockStore((s) => s.activeTab);
  const close = useRightDockStore((s) => s.close);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <ResizablePanel
        side="right"
        defaultWidth={DOCK_DEFAULT_WIDTH}
        minWidth={DOCK_MIN_WIDTH}
        maxWidth={DOCK_MAX_WIDTH}
        collapseThreshold={DOCK_COLLAPSE_THRESHOLD}
        isOpen={isOpen}
        onCollapse={close}
        handleAriaLabel={t('ai.artifacts.sidebar.resizePanel', 'Resize panel')}
        className="border-l border-border bg-background"
      >
        <DockBody noteId={noteId} />
      </ResizablePanel>
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-full h-[90vh] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {activeTab === 'copilot'
              ? t('ai.copilot.tab')
              : t('ai.artifacts.studyTools')}
          </DialogTitle>
        </DialogHeader>
        <DockBody noteId={noteId} />
      </DialogContent>
    </Dialog>
  );
}
