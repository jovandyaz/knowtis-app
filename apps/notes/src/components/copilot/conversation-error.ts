import { isConversationGone } from '@knowtis/data-access-agent';

import { GENERIC_AI_ERROR_KEY } from '../editor/ai/ai-error-messages';

const CONVERSATION_GONE_KEY = 'ai.copilot.history.gone';

export function conversationErrorKey(
  error: unknown
): typeof CONVERSATION_GONE_KEY | typeof GENERIC_AI_ERROR_KEY {
  return isConversationGone(error)
    ? CONVERSATION_GONE_KEY
    : GENERIC_AI_ERROR_KEY;
}
