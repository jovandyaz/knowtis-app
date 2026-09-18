import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useViewportWidth } from '@/hooks/useViewportWidth';
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

import { isStudyFocusOpen } from '../artifacts/focus/study-focus-marker';
import { AgentCopilotPanel } from '../copilot';

const DOCK_MIN_WIDTH = 300;
const DOCK_MAX_WIDTH = 500;
const DOCK_DEFAULT_WIDTH = DOCK_MAX_WIDTH;
const DOCK_COLLAPSE_THRESHOLD = 240;
const TOGGLE_ID = 'right-dock-toggle';

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

function DockHeader() {
  const { t } = useTranslation('notes');
  const newConversation = useAgentStore((s) => s.newConversation);
  const messages = useAgentStore((s) => s.messages);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <span className="text-sm font-medium text-foreground">
        {t('ai.copilot.title')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={newConversation}
        disabled={messages.length === 0}
        aria-label={t('ai.copilot.newConversation')}
        className="shrink-0"
      >
        <RotateCcw className="h-4 w-4" />
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
  const isStreaming = useAgentStore((s) => s.status === 'streaming');
  const reviewingUpdate = reviewOpen && hasUpdateProposal;
  const reviewWidth = reviewDockWidth(useViewportWidth(reviewingUpdate));
  const panelRef = useRef<HTMLElement>(null);

  const handleCollapse = useCallback(() => {
    // The handle unmounts with the panel, so focus would fall to <body>.
    if (panelRef.current?.contains(document.activeElement)) {
      document.getElementById(TOGGLE_ID)?.focus({ preventScroll: true });
    }
    close();
  }, [close]);

  if (isDesktop) {
    return (
      <ResizablePanel
        ref={panelRef}
        side={DIALOG_SIDE.RIGHT}
        defaultWidth={DOCK_DEFAULT_WIDTH}
        minWidth={DOCK_MIN_WIDTH}
        maxWidth={reviewingUpdate ? reviewWidth : DOCK_MAX_WIDTH}
        targetWidth={reviewingUpdate ? reviewWidth : undefined}
        collapseThreshold={DOCK_COLLAPSE_THRESHOLD}
        isOpen={isOpen}
        onCollapse={handleCollapse}
        handleAriaLabel={t('ai.artifacts.sidebar.resizePanel', 'Resize panel')}
        className="bg-background"
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
        onOpenAutoFocus={(event) => {
          if (isStudyFocusOpen()) {
            event.preventDefault();
            close();
          }
        }}
        // Escape discards the proposal under review, or would cancel a live
        // turn; Radix reads Escape in a document capture handler, so only its
        // own opt-out can hold the dock open. pendingProposal stays out of
        // this: there Escape must still reach the dialog.
        onEscapeKeyDown={(event) => {
          if (reviewingUpdate || isStreaming) {
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
