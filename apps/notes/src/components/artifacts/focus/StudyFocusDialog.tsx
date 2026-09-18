import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useBlocker } from '@tanstack/react-router';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  SegmentedProgress,
  type SegmentState,
} from '@knowtis/design-system';

import { STUDY_FOCUS_ATTRIBUTE } from './study-focus-marker';

// eslint-disable-next-line react-refresh/only-export-components -- Tool identifiers are part of the shell's public API.
export const STUDY_TOOL = { FLASHCARDS: 'flashcards', QUIZ: 'quiz' } as const;
export type StudyTool = (typeof STUDY_TOOL)[keyof typeof STUDY_TOOL];

const TOOL_LABEL_KEY = {
  flashcards: 'ai.artifacts.types.flashcards',
  quiz: 'ai.artifacts.types.quiz',
} as const satisfies Record<StudyTool, string>;

const EXIT_BODY_KEY = {
  flashcards: 'ai.artifacts.focus.exit.flashcardsBody',
  quiz: 'ai.artifacts.focus.exit.quizBody',
} as const satisfies Record<StudyTool, string>;

const STAGE_FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea';

function focusStage(stage: HTMLDivElement) {
  const tabbable = Array.from(
    stage.querySelectorAll<HTMLElement>(STAGE_FOCUSABLE_SELECTOR)
  ).find(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled')
  );
  (tabbable ?? stage).focus();
}

export interface StudyFocusProgress {
  segments: readonly SegmentState[];
  label: string;
}

export interface StudyFocusDialogProps {
  tool: StudyTool;
  title: string;
  progress: StudyFocusProgress;
  inProgress: boolean;
  onClose: () => void;
  menu?: ReactNode;
  hints?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Fullscreen study surface. The close button and Escape ask for confirmation
 * while `inProgress`. Initial focus lands on the stage, not on a header control.
 */
export function StudyFocusDialog({
  tool,
  title,
  progress,
  inProgress,
  onClose,
  menu,
  hints,
  actions,
  children,
}: StudyFocusDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const stageRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedExitRef = useRef(false);
  const shouldBlockFn = useCallback(
    () => inProgress && !confirmedExitRef.current,
    [inProgress]
  );
  const blocker = useBlocker({
    shouldBlockFn,
    disabled: !inProgress,
    withResolver: true,
  });
  const latestBlockerRef = useRef(blocker);
  useEffect(() => {
    latestBlockerRef.current = blocker;
  }, [blocker]);
  useEffect(() => {
    // History still awaits an answer if the artifact disappears during confirmation.
    return () => {
      if (latestBlockerRef.current.status === 'blocked') {
        latestBlockerRef.current.proceed?.();
      }
    };
  }, []);
  const keepStudyingRef = useRef(false);
  const cancelExit = () => {
    keepStudyingRef.current = true;
    setConfirmOpen(false);
    blocker.reset?.();
  };

  useEffect(() => {
    if (!inProgress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Session completion must dismiss the independently opened confirmation.
      setConfirmOpen(false);
      // Completion honors the pending request to leave without another confirmation.
      blocker.proceed?.();
    }
  }, [inProgress, blocker]);

  const requestClose = useCallback(() => {
    if (inProgress) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [inProgress, onClose]);

  const toolLabel = t(TOOL_LABEL_KEY[tool]);
  const dialogTitle = t('ai.artifacts.focus.dialogTitle', {
    tool: toolLabel,
    title,
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : requestClose())}>
      <DialogContent
        side="full"
        closeLabel={t('ai.artifacts.focus.exitStudy')}
        aria-label={dialogTitle}
        // Radix sets aria-labelledby before contentProps, so explicit undefined lets aria-label win.
        aria-labelledby={undefined}
        {...{ [STUDY_FOCUS_ATTRIBUTE]: '' }}
        className={cn(
          'bg-(--background) outline-none',
          (hints || actions) && 'grid-rows-[auto_minmax(0,1fr)_auto]'
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          stageRef.current?.focus();
        }}
      >
        <div className="min-w-0">
          <header className="flex min-h-16 min-w-0 items-center gap-3 border-b border-(--border) px-4 py-3 pr-16 lg:px-8 lg:pr-20">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base lg:text-lg">
                <span className="text-(--muted-foreground)">{toolLabel}: </span>
                {title}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-3">{menu}</div>
          </header>
          {progress.segments.length > 0 && (
            <SegmentedProgress
              segments={progress.segments}
              label={progress.label}
              size="track"
            />
          )}
        </div>

        <div
          ref={stageRef}
          tabIndex={-1}
          className="flex min-h-0 flex-col overflow-y-auto outline-none"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8">
            {children}
          </div>
        </div>
        {hints || actions ? (
          <footer className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:px-8">
            {actions}
            {hints}
          </footer>
        ) : null}

        <Dialog
          open={confirmOpen || (inProgress && blocker.status === 'blocked')}
          onOpenChange={(open) => {
            if (!open) {
              cancelExit();
            }
          }}
        >
          <DialogContent
            side="center"
            closeLabel={t('common:labels.closeDialog')}
            onCloseAutoFocus={(event) => {
              if (!keepStudyingRef.current) {
                return;
              }
              keepStudyingRef.current = false;
              const stage = stageRef.current;
              if (!stage) {
                return;
              }
              // This confirmation opens programmatically, so Radix has no trigger to restore focus to.
              event.preventDefault();
              focusStage(stage);
            }}
          >
            <DialogTitle>{t('ai.artifacts.focus.exit.title')}</DialogTitle>
            <DialogDescription>{t(EXIT_BODY_KEY[tool])}</DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={cancelExit} autoFocus>
                {t('ai.artifacts.focus.exit.keep')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(false);
                  if (blocker.status === 'blocked') {
                    blocker.proceed();
                  } else {
                    confirmedExitRef.current = true;
                    onClose();
                  }
                }}
              >
                {t('ai.artifacts.focus.exit.leave')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
