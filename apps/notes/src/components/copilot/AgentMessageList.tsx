import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';
import type { StickToBottomContext } from 'use-stick-to-bottom';

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
  /** Reaches the log that scrolls, for instance to hand it focus. */
  conversationRef?: Ref<StickToBottomContext>;
  /** Shown under the last message, the answer the copilot can continue. */
  continuation?: ReactNode;
  /** Stops the streaming turn on an Escape pressed while the log itself has focus. */
  onStop?: () => void;
}

const LOG_FOCUS_CLASS =
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--ring)';

export function AgentMessageList({
  messages,
  status,
  thinkingDetail,
  hasEarlier = false,
  historyNotice,
  conversationRef,
  continuation,
  onStop,
}: AgentMessageListProps) {
  const { t } = useTranslation('notes');
  const lastAssistant = messages.at(-1);
  const isAssistantTurn =
    status === 'streaming' && lastAssistant?.role === 'assistant';
  const answering = isAssistantTurn && lastAssistant.content.length > 0;

  // Streamdown's overlays inside a message close on Escape without preventing
  // its default, and React bubbles that Escape up through this log.
  const stopOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'Escape' ||
      status !== 'streaming' ||
      event.target !== event.currentTarget ||
      event.defaultPrevented
    ) {
      return;
    }
    event.preventDefault();
    onStop?.();
  };

  return (
    <Conversation {...(conversationRef ? { contextRef: conversationRef } : {})}>
      <ConversationContent
        logProps={{
          'aria-label': t('ai.copilot.history.thread'),
          'aria-busy': status === 'streaming',
          'aria-live': 'polite',
          tabIndex: -1,
          className: LOG_FOCUS_CLASS,
          onKeyDown: stopOnEscape,
        }}
      >
        {historyNotice}
        {hasEarlier && (
          <p className="text-center text-xs text-muted-foreground">
            {t('ai.copilot.history.earlier')}
          </p>
        )}
        {messages.map((message, index) => (
          <AgentMessage
            key={message.id}
            message={message}
            isStreaming={
              status === 'streaming' && message.id === lastAssistant?.id
            }
            footer={index === messages.length - 1 ? continuation : undefined}
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
