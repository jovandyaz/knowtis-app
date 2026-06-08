import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowUp } from 'lucide-react';

import { Button, cn, Textarea } from '@knowtis/design-system';

interface AgentComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function AgentComposer({ onSend, disabled }: AgentComposerProps) {
  const { t } = useTranslation('notes');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) {
      return;
    }
    onSend(text);
    setValue('');
  };

  return (
    <div className="border-t border-border p-2">
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('ai.copilot.placeholder')}
          aria-label={t('ai.copilot.placeholder')}
          rows={1}
          className="min-h-9 max-h-32 resize-none"
        />
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label={t('ai.copilot.send')}
          className={cn('h-9 w-9 shrink-0 p-0')}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1 px-1 text-[10px] text-muted-foreground">
        {t('ai.copilot.composerHint')}
      </p>
    </div>
  );
}
