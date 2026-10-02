import type { ReactNode } from 'react';

import type { AgentChatMessage } from '@/stores/agent.store';

import { MESSAGE_KIND } from '@knowtis/shared-types';

import { Message, MessageContent, Response } from '../ai-elements/message';
import { AgentContinueChip } from './AgentContinueChip';
import { AgentResolvedChip } from './AgentResolvedChip';
import { AgentSourceChips } from './AgentSourceChips';
import { AgentStopNotice } from './AgentStopNotice';
import { AgentWebSourceChips } from './AgentWebSourceChips';

export function AgentMessage({
  message,
  isStreaming,
  footer,
}: {
  message: AgentChatMessage;
  isStreaming: boolean;
  footer?: ReactNode;
}) {
  if (message.kind === MESSAGE_KIND.CONTINUE) {
    return (
      <Message from="user">
        <AgentContinueChip />
      </Message>
    );
  }

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
            <AgentStopNotice
              reason={message.stopReason}
              interrupted={message.interrupted}
            />
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
            {footer}
          </>
        )}
      </MessageContent>
    </Message>
  );
}
