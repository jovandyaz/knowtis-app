import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import type { AgentStatus } from '@/stores/agent.store';
import { ArrowUp, Square } from 'lucide-react';

import { Button, Textarea } from '@knowtis/design-system';

interface AgentComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  status: AgentStatus;
  modelPicker?: ReactNode;
}

export function AgentComposer({
  onSend,
  onStop,
  status,
  modelPicker,
}: AgentComposerProps) {
  const { t } = useTranslation('notes');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(ref, value);

  const isStreaming = status === 'streaming';
  const sendBlocked = isStreaming || status === 'pendingProposal';

  const submit = () => {
    const text = value.trim();
    if (!text || sendBlocked) {
      return;
    }
    onSend(text);
    setValue('');
    ref.current?.focus();
  };

  return (
    <div className="p-2">
      <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-1">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('ai.copilot.placeholder')}
          aria-label={t('ai.copilot.placeholder')}
          rows={1}
          className="max-h-48 min-h-9 resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">{modelPicker}</div>
          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onStop}
              aria-label={t('ai.copilot.stop')}
              className="h-8 w-8 shrink-0 p-0"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={sendBlocked || value.trim().length === 0}
              aria-label={t('ai.copilot.send')}
              className="h-8 w-8 shrink-0 p-0"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 px-1 text-[10px] text-muted-foreground">
        {t('ai.copilot.composerHint')}
      </p>
    </div>
  );
}
