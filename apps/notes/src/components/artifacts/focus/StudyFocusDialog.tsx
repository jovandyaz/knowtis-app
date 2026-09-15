import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useBlocker } from '@tanstack/react-router';

import { motion } from 'motion/react';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  ProgressRing,
  useMotionPreset,
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

const STAGE_RISE_Y = 12;

export interface StudyFocusProgress {
  value: number;
  max: number;
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
  const preset = useMotionPreset();
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
  const cancelExit = () => {
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
          'bg-(--background)',
          (hints || actions) && 'grid-rows-[auto_minmax(0,1fr)_auto]'
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          stageRef.current?.focus();
        }}
      >
        <header className="flex min-h-16 min-w-0 items-center gap-3 border-b border-(--border) px-4 py-3 pr-16 lg:px-8 lg:pr-20">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base lg:text-lg">
              <span className="text-(--muted-foreground)">{toolLabel}: </span>
              {title}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-3">
            {progress.max > 0 && (
              <>
                <ProgressRing
                  value={progress.value}
                  max={progress.max}
                  label={progress.label}
                >
                  {progress.value}
                </ProgressRing>
                <span
                  className="hidden text-sm text-(--muted-foreground) sm:inline"
                  aria-hidden="true"
                >
                  {progress.label}
                </span>
              </>
            )}
            {menu}
          </div>
        </header>

        <div
          ref={stageRef}
          tabIndex={-1}
          className="flex min-h-0 flex-col overflow-y-auto outline-none"
        >
          <motion.div
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8"
            initial={{ opacity: 0, y: preset.reduced ? 0 : STAGE_RISE_Y }}
            animate={{ opacity: 1, y: 0 }}
            transition={preset.fade}
          >
            {children}
          </motion.div>
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
