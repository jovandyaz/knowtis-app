import type { ReactNode } from 'react';
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

interface AgentMessageListProps {
  messages: AgentChatMessage[];
  status: AgentStatus;
  thinkingDetail?: string;
  hasEarlier?: boolean;
  /** Shown above the thread, where the earlier messages would be. */
  historyNotice?: ReactNode;
}

export function AgentMessageList({
  messages,
  status,
  thinkingDetail,
  hasEarlier = false,
  historyNotice,
}: AgentMessageListProps) {
  const { t } = useTranslation('notes');
  const lastAssistant = messages.at(-1);
  const isAssistantTurn =
    status === 'streaming' && lastAssistant?.role === 'assistant';
  const answering = isAssistantTurn && lastAssistant.content.length > 0;

  return (
    <Conversation aria-busy={status === 'streaming'} aria-live="polite">
      <ConversationContent>
        {historyNotice}
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
