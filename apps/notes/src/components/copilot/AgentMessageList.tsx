import { useTranslation } from 'react-i18next';

import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import { AgentMessage } from './AgentMessage';
import { AgentQueuedMessages } from './AgentQueuedMessages';
import { AgentStatusIndicator } from './AgentStatusIndicator';
import { HistoryRetryRow } from './HistoryRetryRow';

interface AgentMessageListProps {
  messages: AgentChatMessage[];
  status: AgentStatus;
  thinkingDetail?: string;
  hasEarlier?: boolean;
  /** Offered only while the earlier messages of the thread failed to load. */
  onRetryHistory?: () => void;
}

export function AgentMessageList({
  messages,
  status,
  thinkingDetail,
  hasEarlier = false,
  onRetryHistory,
}: AgentMessageListProps) {
  const { t } = useTranslation('notes');
  const lastAssistant = messages.at(-1);
  const isAssistantTurn =
    status === 'streaming' && lastAssistant?.role === 'assistant';
  const answering = isAssistantTurn && lastAssistant.content.length > 0;

  return (
    <Conversation aria-busy={status === 'streaming'} aria-live="polite">
      <ConversationContent>
        {onRetryHistory && <HistoryRetryRow onRetry={onRetryHistory} />}
        {hasEarlier && (
          <p className="text-center text-xs text-muted-foreground">
            {t('ai.copilot.history.earlier')}
          </p>
        )}
        {messages.map((message) => (
          <AgentMessage
            key={message.id}
            message={message}
            isStreaming={
              status === 'streaming' && message.id === lastAssistant?.id
            }
          />
        ))}
        {isAssistantTurn && (
          <AgentStatusIndicator detail={thinkingDetail} answering={answering} />
        )}
        <AgentQueuedMessages />
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
