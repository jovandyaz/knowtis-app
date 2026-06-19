import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import {
  useRightDockStore,
  type RightDockTab,
} from '@/stores/right-dock.store';
import { BookOpen, RotateCcw, Sparkles } from 'lucide-react';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ResizablePanel,
  SegmentedControl,
  type SegmentedControlItem,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';

import { AgentCopilotPanel } from '../copilot';
import { StudyToolsTab } from './StudyToolsTab';

const DOCK_MIN_WIDTH = 300;
const DOCK_MAX_WIDTH = 500;
const DOCK_DEFAULT_WIDTH = DOCK_MAX_WIDTH;
const DOCK_COLLAPSE_THRESHOLD = 240;

function DockHeader() {
  const { t } = useTranslation('notes');
  const activeTab = useRightDockStore((s) => s.activeTab);
  const setTab = useRightDockStore((s) => s.setTab);
  const newConversation = useAgentStore((s) => s.newConversation);
  const messages = useAgentStore((s) => s.messages);

  const items: SegmentedControlItem[] = [
    { value: 'copilot', label: t('ai.copilot.tab'), icon: Sparkles },
    { value: 'estudio', label: t('ai.artifacts.studyTools'), icon: BookOpen },
  ];

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border p-2">
      <SegmentedControl
        idBase="right-dock"
        ariaLabel={t('ai.copilot.dockLabel')}
        value={activeTab}
        onValueChange={(v) => setTab(v as RightDockTab)}
        items={items}
        className="flex-1"
      />
      {activeTab === 'copilot' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={newConversation}
          disabled={messages.length === 0}
          aria-label={t('ai.copilot.newConversation')}
          className="h-7 w-7 shrink-0 p-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function DockBody({ noteId }: { noteId: string | null }) {
  const activeTab = useRightDockStore((s) => s.activeTab);
  return (
    <div className="flex h-full flex-col min-w-0">
      <DockHeader />
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
