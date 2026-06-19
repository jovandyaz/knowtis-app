import type { AgentChatMessage } from '@/stores/agent.store';

import { Message, MessageContent, Response } from '../ai-elements/message';
import { AgentResolvedChip } from './AgentResolvedChip';
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
            {(message.committed || message.discarded) && (
              <AgentResolvedChip
                committed={message.committed}
                discarded={message.discarded}
              />
            )}
            <Response
              animated
              isAnimating={isStreaming}
              {...(!isStreaming && { mode: 'static' as const })}
            >
              {message.content}
            </Response>
            {isStreaming && message.content.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary motion-reduce:animate-none"
              />
            )}
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
