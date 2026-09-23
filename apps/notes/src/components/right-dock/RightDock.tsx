import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useViewportWidth } from '@/hooks/useViewportWidth';
import { isUpdateProposal, useAgentStore } from '@/stores/agent.store';
import {
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  useDockPreferenceStore,
} from '@/stores/dock-preference.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { RotateCcw } from 'lucide-react';

import {
  Button,
  cn,
  Dialog,
  DIALOG_SIDE,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ResizablePanel,
} from '@knowtis/design-system';
import { useCollapseFocusReturn, useMediaQuery } from '@knowtis/shared-hooks';

import { isStudyFocusOpen } from '../artifacts/focus/study-focus-marker';
import { AgentCopilotPanel } from '../copilot/AgentCopilotPanel';
import { ConversationSwitcher } from '../copilot/ConversationSwitcher';

const DOCK_COLLAPSE_THRESHOLD = 240;
const DOCK_PRESENTATION = {
  CLOSED: 'closed',
  INLINE: 'inline',
  DIALOG: 'dialog',
} as const;
type DockPresentation =
  (typeof DOCK_PRESENTATION)[keyof typeof DOCK_PRESENTATION];
export const TOGGLE_ID = 'right-dock-toggle';
export const PANEL_ID = 'right-dock-panel';

/** 480 px of content plus the 64 px of outer gutters the main column adds. */
const DOCUMENT_RESERVE = 544;

/** Chat prose stops being readable past ~80 characters, so the conversation
 * keeps its measure while the dock itself gets the extra width. */
export const CONVERSATION_MEASURE = 'max-w-xl';

const REVIEW_MAX_WIDTH = 960;
/** Independent of DOCK_MAX_WIDTH: how wide the user may drag the everyday dock
 * must not decide how much of the document a diff is allowed to cover. */
const REVIEW_MIN_WIDTH = 500;
const REVIEW_VIEWPORT_RATIO = 0.6;

export function reviewDockWidth(viewportWidth: number): number {
  return Math.round(
    Math.min(
      REVIEW_MAX_WIDTH,
      Math.max(REVIEW_MIN_WIDTH, viewportWidth * REVIEW_VIEWPORT_RATIO)
    )
  );
}

/** Room left for the dock once the document keeps its reserve. */
function roomBesideDocument(
  viewportWidth: number,
  sidebarWidth: number
): number {
  return viewportWidth - sidebarWidth - DOCUMENT_RESERVE;
}

function DockHeader() {
  const { t } = useTranslation('notes');
  const newConversation = useAgentStore((s) => s.newConversation);
  const hasConversation = useAgentStore(
    (s) => s.messages.length > 0 || s.conversationId !== null
  );

  // The row is always here so the panel's top edge does not jump when the first
  // message lands; the action itself has nothing to reset until then.
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
      <div className="min-w-0 flex-1">
        <ConversationSwitcher />
      </div>
      {hasConversation && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={newConversation}
          aria-label={t('ai.copilot.newConversation')}
          className="shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface DockBodyProps {
  /** A diff is two columns of note text, so it takes the whole dock. */
  fullBleed: boolean;
}

function DockBody({ fullBleed }: DockBodyProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex h-full flex-col min-w-0">
      <h2 className="sr-only">{t('ai.copilot.title')}</h2>
      <div
        className={cn(
          'mx-auto flex w-full flex-1 flex-col min-h-0 min-w-0',
          !fullBleed && CONVERSATION_MEASURE
        )}
      >
        <DockHeader />
        <div id={PANEL_ID} className="flex-1 overflow-hidden min-h-0">
          <AgentCopilotPanel />
        </div>
      </div>
    </div>
  );
}

interface DockDialogProps {
  fullBleed: boolean;
  modal: boolean;
  openInlineRef: RefObject<boolean>;
  holdOpenOnEscape: boolean;
  onClose: () => void;
}

function DockDialog({
  fullBleed,
  modal,
  openInlineRef,
  holdOpenOnEscape,
  onClose,
}: DockDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open modal={modal} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[90vh] max-w-full flex-col gap-0 overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]"
        closeLabel={t('common:labels.closeDialog')}
        onOpenAutoFocus={(event) => {
          if (isStudyFocusOpen()) {
            event.preventDefault();
            onClose();
            return;
          }
          if (!modal) {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          // The content is detached by the time this runs, so focus it held now
          // reads as <body>; anything else is focus the dialog never took.
          const dialogTookFocusAway =
            document.activeElement === null ||
            document.activeElement === document.body;
          if (!openInlineRef.current || !dialogTookFocusAway) {
            return;
          }
          event.preventDefault();
          document.getElementById(TOGGLE_ID)?.focus({ preventScroll: true });
        }}
        onInteractOutside={(event) => {
          if (!modal) {
            event.preventDefault();
          }
        }}
        // Escape discards the proposal under review, or would cancel a live
        // turn; Radix reads Escape in a document capture handler, so only its
        // own opt-out can hold the dock open. pendingProposal stays out of
        // this: there Escape must still reach the dialog. Beside a page still
        // in use, only an Escape pressed inside the dock is meant for it.
        onEscapeKeyDown={(event) => {
          const pressedInsideDock =
            event.target instanceof Node &&
            bodyRef.current
              ?.closest('[role="dialog"]')
              ?.contains(event.target) === true;
          if (holdOpenOnEscape || (!modal && !pressedInsideDock)) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('ai.copilot.tab')}</DialogTitle>
        </DialogHeader>
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
          <DockBody fullBleed={fullBleed} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RightDock() {
  const { t } = useTranslation(['notes', 'common']);
  const isOpen = useRightDockStore((s) => s.isOpen);
  const close = useRightDockStore((s) => s.close);
  const preferredWidth = useDockPreferenceStore((s) => s.preferredWidth);
  const setPreferredWidth = useDockPreferenceStore((s) => s.setPreferredWidth);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const reviewOpen = useRightDockStore((s) => s.reviewOpen);
  const hasUpdateProposal = useAgentStore(
    (s) => s.pendingProposal !== null && isUpdateProposal(s.pendingProposal)
  );
  const isStreaming = useAgentStore((s) => s.status === 'streaming');
  const reviewingUpdate = reviewOpen && hasUpdateProposal;
  const viewportWidth = useViewportWidth();
  const sidebarWidth = useSidebarStore((s) => s.visibleWidth);
  const room = roomBesideDocument(viewportWidth, sidebarWidth);
  const everydayMaxWidth = Math.min(DOCK_MAX_WIDTH, room);
  const fitsBesideDocument = isDesktop && everydayMaxWidth >= DOCK_MIN_WIDTH;
  // The reserve protects writing, and nobody writes behind a diff they opened
  // to read: a review owes the document nothing, and only the sidebar and the
  // viewport bound it.
  const dockMaxWidth = reviewingUpdate
    ? Math.min(reviewDockWidth(viewportWidth), viewportWidth - sidebarWidth)
    : everydayMaxWidth;
  const presentation: DockPresentation = !isOpen
    ? DOCK_PRESENTATION.CLOSED
    : fitsBesideDocument
      ? DOCK_PRESENTATION.INLINE
      : DOCK_PRESENTATION.DIALOG;
  const [lastPresentation, setLastPresentation] = useState(presentation);
  const [layoutMovedDockIntoDialog, setLayoutMovedDockIntoDialog] =
    useState(false);
  // A dialog that took over from the open inline dock was the layout's doing,
  // not the user's, so it must not take the page from them. This only changes
  // with the presentation: Radix remounts the content whenever `modal` flips.
  if (presentation !== lastPresentation) {
    setLastPresentation(presentation);
    setLayoutMovedDockIntoDialog(lastPresentation === DOCK_PRESENTATION.INLINE);
  }
  const panelRef = useRef<HTMLElement>(null);
  const openInlineRef = useRef(false);
  useEffect(() => {
    openInlineRef.current = isOpen && fitsBesideDocument;
  }, [isOpen, fitsBesideDocument]);

  const returnFocusToToggle = useCollapseFocusReturn(panelRef, TOGGLE_ID);
  const handleCollapse = useCallback(() => {
    returnFocusToToggle();
    close();
  }, [returnFocusToToggle, close]);

  if (fitsBesideDocument) {
    return (
      <ResizablePanel
        ref={panelRef}
        side={DIALOG_SIDE.RIGHT}
        defaultWidth={preferredWidth}
        minWidth={DOCK_MIN_WIDTH}
        maxWidth={dockMaxWidth}
        targetWidth={reviewingUpdate ? dockMaxWidth : undefined}
        collapseThreshold={DOCK_COLLAPSE_THRESHOLD}
        isOpen={isOpen}
        onCollapse={handleCollapse}
        onResizeEnd={setPreferredWidth}
        handleAriaLabel={t('ai.artifacts.sidebar.resizePanel', 'Resize panel')}
        className="bg-background"
      >
        <DockBody fullBleed={reviewingUpdate} />
      </ResizablePanel>
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <DockDialog
      fullBleed={reviewingUpdate}
      modal={!layoutMovedDockIntoDialog}
      openInlineRef={openInlineRef}
      holdOpenOnEscape={reviewingUpdate || isStreaming}
      onClose={close}
    />
  );
}
