import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import { AgentMessage } from './AgentMessage';
import { AgentStatusIndicator } from './AgentStatusIndicator';

interface AgentMessageListProps {
  messages: AgentChatMessage[];
  status: AgentStatus;
  thinkingDetail?: string;
}

export function AgentMessageList({
  messages,
  status,
  thinkingDetail,
}: AgentMessageListProps) {
  const lastAssistant = messages.at(-1);
  const isAssistantTurn =
    status === 'streaming' && lastAssistant?.role === 'assistant';
  const answering = isAssistantTurn && lastAssistant.content.length > 0;

  return (
    <Conversation aria-busy={status === 'streaming'} aria-live="polite">
      <ConversationContent>
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
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
