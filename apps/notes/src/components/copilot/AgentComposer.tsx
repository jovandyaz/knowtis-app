import {
  useCallback,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { isTurnAlive, type AgentStatus } from '@/stores/agent.store';
import { ArrowUp, Square } from 'lucide-react';

import { Button, cn, Textarea } from '@knowtis/design-system';
import { formatShortcut } from '@knowtis/shared-util';

interface ComposerInputProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onSendNow: (text: string) => void;
  onStop: () => void;
  onTakeBack: () => void;
  /** Drives the paused hint and enables ↑ take-back on an empty draft. */
  queueLength: number;
  status: AgentStatus;
  modelPicker?: ReactNode;
}

interface AgentComposerProps extends ComposerInputProps {
  counter?: ReactNode;
  locked?: ReactNode;
}

const ICON_BUTTON_CLASS = 'h-8 w-8 shrink-0 p-0';
const FOCUSABLE_SELECTOR = 'button, a[href], [tabindex]:not([tabindex="-1"])';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

function LockSlot({
  children,
  onUnmount,
}: {
  children: ReactNode;
  onUnmount: () => void;
}) {
  useLayoutEffect(() => onUnmount, [onUnmount]);
  return children;
}

function ComposerInput({
  onUnmount,
  draft,
  onDraftChange,
  onSend,
  onSendNow,
  onStop,
  onTakeBack,
  queueLength,
  status,
  modelPicker,
}: ComposerInputProps & { onUnmount: () => void }) {
  const { t } = useTranslation('notes');
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(ref, draft);
  useLayoutEffect(() => onUnmount, [onUnmount]);

  const alive = isTurnAlive(status);
  const isStreaming = status === 'streaming';
  const text = draft.trim();
  const hasText = text.length > 0;

  const submit = (now: boolean) => {
    if (!hasText) {
      return;
    }
    (now ? onSendNow : onSend)(text);
    onDraftChange('');
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      submit(e.metaKey || e.ctrlKey);
      return;
    }
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === 'ArrowUp' && draft === '' && queueLength > 0) {
      e.preventDefault();
      onTakeBack();
    }
  };

  return (
    <>
      <Textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('ai.copilot.placeholder')}
        aria-label={t('ai.copilot.placeholder')}
        rows={1}
        className="max-h-48 min-h-9 resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">{modelPicker}</div>
        <div className="flex items-center gap-1">
          {isStreaming && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onStop}
              aria-label={t('ai.copilot.stop')}
              className={ICON_BUTTON_CLASS}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}
          {(!alive || hasText) && (
            <Button
              type="button"
              size="sm"
              variant={alive ? 'secondary' : 'default'}
              onClick={() => submit(false)}
              disabled={!hasText}
              aria-label={t(alive ? 'ai.copilot.queueAdd' : 'ai.copilot.send')}
              className={ICON_BUTTON_CLASS}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function AgentComposer({
  counter,
  locked,
  ...inputProps
}: AgentComposerProps) {
  const { t } = useTranslation('notes');
  const { status, queueLength } = inputProps;
  const shellRef = useRef<HTMLDivElement>(null);
  const shellHeldFocusWhenSwapped = useRef(false);
  const isLocked = Boolean(locked);
  const wasLocked = useRef(isLocked);

  const noteFocusOnSwap = useCallback(() => {
    shellHeldFocusWhenSwapped.current =
      shellRef.current?.contains(document.activeElement) === true;
  }, []);

  useLayoutEffect(() => {
    const swapped = wasLocked.current !== isLocked;
    wasLocked.current = isLocked;
    const shellHeldFocus = shellHeldFocusWhenSwapped.current;
    shellHeldFocusWhenSwapped.current = false;
    const shell = shellRef.current;
    if (!swapped || !shell) {
      return;
    }
    if (isLocked) {
      if (shellHeldFocus) {
        shell
          .querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
          ?.focus({ preventScroll: true });
      }
      return;
    }
    const active = document.activeElement;
    const focusOnPage = active === null || active === document.body;
    const touchScreen = window.matchMedia(COARSE_POINTER_QUERY).matches;
    if (shellHeldFocus || (focusOnPage && !touchScreen)) {
      shell.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }, [isLocked]);

  const hint = isTurnAlive(status)
    ? t('ai.copilot.composerHintBusy', {
        shortcut: formatShortcut('Mod+Enter'),
      })
    : queueLength > 0
      ? t('ai.copilot.composerHintPaused')
      : t('ai.copilot.composerHint');

  return (
    <div className="p-2">
      <div
        ref={shellRef}
        className={cn(
          'flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-2',
          !isLocked &&
            'focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-1'
        )}
      >
        {locked ? (
          <LockSlot onUnmount={noteFocusOnSwap}>{locked}</LockSlot>
        ) : (
          <ComposerInput {...inputProps} onUnmount={noteFocusOnSwap} />
        )}
      </div>
      {!isLocked && (
        <div className="mt-1 flex items-baseline justify-between gap-2 px-1 text-[10px]">
          <p className="min-w-0 text-muted-foreground">{hint}</p>
          {counter}
        </div>
      )}
    </div>
  );
}
