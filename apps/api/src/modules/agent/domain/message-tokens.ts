import { estimateTokenCount } from '@knowtis/ai-gateway';

import type { AgentMessage } from './agent-message';

/** Token cost of one message as the provider sees it: its text plus the serialized
 * tool parts it carries. Deliberately an upper bound — a row carrying both text and
 * a tool call bills its text twice, because `content` mirrors the text parts. Over-
 * reserving is the safe direction for a budget, so do not tighten this downward. */
export function estimateMessageTokens(message: AgentMessage): number {
  return (
    estimateTokenCount(message.content) +
    (message.parts ? estimateTokenCount(JSON.stringify(message.parts)) : 0)
  );
}
