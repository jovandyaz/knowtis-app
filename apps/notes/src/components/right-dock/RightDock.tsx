import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { RotateCcw } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ResizablePanel,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';

import { AgentCopilotPanel } from '../copilot';

const DOCK_MIN_WIDTH = 300;
const DOCK_MAX_WIDTH = 500;
const DOCK_DEFAULT_WIDTH = DOCK_MAX_WIDTH;
const DOCK_COLLAPSE_THRESHOLD = 240;

function DockHeader() {
  const { t } = useTranslation('notes');
  const newConversation = useAgentStore((s) => s.newConversation);
  const messages = useAgentStore((s) => s.messages);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border p-2">
      <span className="px-1 text-sm font-medium text-foreground">
        {t('ai.copilot.title')}
      </span>
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
    </div>
  );
}

function DockBody() {
  return (
    <div className="flex h-full flex-col min-w-0">
      <DockHeader />
      <div className="flex-1 overflow-hidden min-h-0">
        <AgentCopilotPanel />
      </div>
    </div>
  );
}

export function RightDock() {
  const { t } = useTranslation('notes');
  const isOpen = useRightDockStore((s) => s.isOpen);
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
        <DockBody />
      </ResizablePanel>
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex h-[90vh] max-w-full flex-col gap-0 overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('ai.copilot.tab')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <DockBody />
        </div>
      </DialogContent>
    </Dialog>
  );
}
