import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { X } from 'lucide-react';

import { Button } from '@knowtis/design-system';

export function AgentQueuedMessages() {
  const { t } = useTranslation('notes');
  const queue = useAgentStore((s) => s.queue);
  const sendQueuedNow = useAgentStore((s) => s.sendQueuedNow);
  const removeQueued = useAgentStore((s) => s.removeQueued);
  if (queue.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label={t('ai.copilot.queue')}>
      {queue.map((item) => (
        <li
          key={item.id}
          className="ml-auto flex w-full max-w-[95%] flex-col items-end gap-1"
        >
          <p className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            {item.text}
          </p>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{t('ai.copilot.queue')}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sendQueuedNow(item.id)}
              className="h-6 px-1.5 text-[10px]"
            >
              {t('ai.copilot.queueSendNow')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeQueued(item.id)}
              aria-label={t('ai.copilot.queueRemove')}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
