import type { AgentChatMessage } from '@/stores/agent.store';
import { Streamdown } from 'streamdown';

import { cn } from '@knowtis/design-system';

import { AgentSourceChips } from './AgentSourceChips';

export function AgentMessage({
  message,
  isStreaming,
}: {
  message: AgentChatMessage;
  isStreaming: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-primary/20 px-3 py-2 text-sm text-foreground">
        {message.content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'max-w-full rounded-2xl rounded-bl-sm border border-border/60 bg-muted/40 px-3 py-2 text-sm text-foreground',
        'prose prose-sm dark:prose-invert max-w-none'
      )}
    >
      <Streamdown
        animated
        isAnimating={isStreaming}
        {...(!isStreaming && { mode: 'static' as const })}
      >
        {message.content}
      </Streamdown>
      {message.sources && <AgentSourceChips sources={message.sources} />}
    </div>
  );
}
