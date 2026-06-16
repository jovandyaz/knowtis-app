import type { AgentChatMessage } from '@/stores/agent.store';

import { Message, MessageContent, Response } from '../ai-elements/message';
import { AgentSourceChips } from './AgentSourceChips';
import { AgentWebSourceChips } from './AgentWebSourceChips';

export function AgentMessage({
  message,
  isStreaming,
}: {
  message: AgentChatMessage;
  isStreaming: boolean;
}) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.role === 'user' ? (
          message.content
        ) : (
          <>
            <Response
              animated
              isAnimating={isStreaming}
              {...(!isStreaming && { mode: 'static' as const })}
            >
              {message.content}
            </Response>
            {message.sources && <AgentSourceChips sources={message.sources} />}
            {message.webSources && (
              <AgentWebSourceChips sources={message.webSources} />
            )}
          </>
        )}
      </MessageContent>
    </Message>
  );
}
