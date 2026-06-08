import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import { AgentMessage } from './AgentMessage';
import { AgentStatusIndicator } from './AgentStatusIndicator';

export function AgentMessageList({
  messages,
  status,
}: {
  messages: AgentChatMessage[];
  status: AgentStatus;
}) {
  const lastAssistant = messages.at(-1);
  const showThinking =
    status === 'streaming' &&
    lastAssistant?.role === 'assistant' &&
    lastAssistant.content.length === 0;

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
        {showThinking && <AgentStatusIndicator />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
