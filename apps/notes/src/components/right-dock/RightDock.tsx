import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { isUpdateProposal, useAgentStore } from '@/stores/agent.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { RotateCcw } from 'lucide-react';

import {
  Button,
  Dialog,
  DIALOG_SIDE,
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

const REVIEW_MAX_WIDTH = 960;
const REVIEW_VIEWPORT_RATIO = 0.6;

export function reviewDockWidth(viewportWidth: number): number {
  return Math.round(
    Math.min(
      REVIEW_MAX_WIDTH,
      Math.max(DOCK_MAX_WIDTH, viewportWidth * REVIEW_VIEWPORT_RATIO)
    )
  );
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerWidth,
    () => 0
  );
}

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
  const { t } = useTranslation(['notes', 'common']);
  const isOpen = useRightDockStore((s) => s.isOpen);
  const close = useRightDockStore((s) => s.close);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const reviewOpen = useRightDockStore((s) => s.reviewOpen);
  const hasUpdateProposal = useAgentStore(
    (s) => s.pendingProposal !== null && isUpdateProposal(s.pendingProposal)
  );
  const reviewingUpdate = reviewOpen && hasUpdateProposal;
  const reviewWidth = reviewDockWidth(useViewportWidth());

  if (isDesktop) {
    return (
      <ResizablePanel
        side={DIALOG_SIDE.RIGHT}
        defaultWidth={DOCK_DEFAULT_WIDTH}
        minWidth={DOCK_MIN_WIDTH}
        maxWidth={reviewingUpdate ? reviewWidth : DOCK_MAX_WIDTH}
        targetWidth={reviewingUpdate ? reviewWidth : undefined}
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
      <DialogContent
        className="flex h-[90vh] max-w-full flex-col gap-0 overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]"
        closeLabel={t('common:labels.closeDialog')}
        // Escape discards the proposal under review; Radix reads Escape in a
        // document capture handler, so only its own opt-out can hold the dock open.
        onEscapeKeyDown={(event) => {
          if (reviewingUpdate) {
            event.preventDefault();
          }
        }}
      >
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
