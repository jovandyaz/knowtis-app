import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { motion } from 'motion/react';

import {
  Button,
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
  children: ReactNode;
}

/**
 * Fullscreen study surface. Leaving (close button, Escape, caller-driven exits)
 * asks for confirmation while `inProgress`; `onClose` fires only when the user
 * really leaves. Initial focus lands on the stage, not on a header control.
 */
export function StudyFocusDialog({
  tool,
  title,
  progress,
  inProgress,
  onClose,
  menu,
  hints,
  children,
}: StudyFocusDialogProps) {
  const { t } = useTranslation(['notes', 'common']);
  const preset = useMotionPreset();
  const stageRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
        aria-labelledby={undefined}
        {...{ [STUDY_FOCUS_ATTRIBUTE]: '' }}
        className="bg-(--background)"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          stageRef.current?.focus();
        }}
      >
        <header className="flex min-h-16 items-center gap-3 border-b border-(--border) px-4 py-3 pr-16 lg:px-8 lg:pr-20">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base lg:text-lg">
              <span className="text-(--muted-foreground)">{toolLabel}: </span>
              {title}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-3">
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
          {hints ? <div className="px-4 pb-4 lg:px-8">{hints}</div> : null}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent
            side="center"
            closeLabel={t('common:labels.closeDialog')}
          >
            <DialogTitle>{t('ai.artifacts.focus.exit.title')}</DialogTitle>
            <DialogDescription>{t(EXIT_BODY_KEY[tool])}</DialogDescription>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                autoFocus
              >
                {t('ai.artifacts.focus.exit.keep')}
              </Button>
              <Button variant="destructive" onClick={onClose}>
                {t('ai.artifacts.focus.exit.leave')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
