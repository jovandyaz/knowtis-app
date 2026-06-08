import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { RotateCcw } from 'lucide-react';

import { Button } from '@knowtis/design-system';

import { aiErrorMessageKey } from '../editor/ai/ai-error-messages';
import { AgentComposer } from './AgentComposer';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentMessageList } from './AgentMessageList';

export function AgentCopilotPanel() {
  const { t } = useTranslation('notes');
  const messages = useAgentStore((s) => s.messages);
  const status = useAgentStore((s) => s.status);
  const error = useAgentStore((s) => s.error);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const newConversation = useAgentStore((s) => s.newConversation);
  const retryLast = useAgentStore((s) => s.retryLast);

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={newConversation}
          disabled={messages.length === 0}
          aria-label={t('ai.copilot.newConversation')}
          className="h-7 w-7 p-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <AgentEmptyState />
        </div>
      ) : (
        <AgentMessageList messages={messages} status={status} />
      )}

      {status === 'error' && (
        <div role="alert" className="px-3 py-2 text-xs text-destructive">
          {t(aiErrorMessageKey(error?.code ?? ''))}{' '}
          <button
            type="button"
            onClick={retryLast}
            className="underline underline-offset-2"
          >
            {t('ai.preview.retry')}
          </button>
        </div>
      )}
      {status === 'timeout' && (
        <div role="alert" className="px-3 py-2 text-xs text-destructive">
          {t('ai.errors.timeout')}{' '}
          <button
            type="button"
            onClick={retryLast}
            className="underline underline-offset-2"
          >
            {t('ai.preview.retry')}
          </button>
        </div>
      )}

      <AgentComposer onSend={sendMessage} disabled={status === 'streaming'} />
    </div>
  );
}
