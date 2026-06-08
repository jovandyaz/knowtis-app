import { useEffect, useRef } from 'react';

import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';

import { AgentMessage } from './AgentMessage';
import { AgentStatusIndicator } from './AgentStatusIndicator';

export function AgentMessageList({
  messages,
  status,
}: {
  messages: AgentChatMessage[];
  status: AgentStatus;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = messages.at(-1);
  const showThinking =
    status === 'streaming' &&
    lastAssistant?.role === 'assistant' &&
    lastAssistant.content.length === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-busy={status === 'streaming'}
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-3"
    >
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
      <div ref={endRef} />
    </div>
  );
}
