import type { MessageStopReason } from './ai.types';

export const CONVERSATION_TITLE_MAX = 120;

export const AGENT_CONVERSATION_NOT_FOUND_CODE = 'AGENT_CONVERSATION_NOT_FOUND';

const WHITESPACE_RUN = /\s+/g;
const WORD_SEPARATOR = ' ';

export interface ConversationSummary {
  id: string;
  title: string | null;
  noteId: string | null;
  noteTitle: string | null;
  updatedAt: string;
}

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface ConversationTranscriptMessage {
  turnId: string | null;
  role: 'user' | 'assistant';
  content: string;
  sources: { id: string; title: string }[];
  stopReason: MessageStopReason | null;
}

export interface ConversationTranscript {
  id: string;
  title: string | null;
  noteId: string | null;
  hasEarlier: boolean;
  messages: ConversationTranscriptMessage[];
}

export function normalizeConversationTitle(title: string): string {
  return title.replace(WHITESPACE_RUN, WORD_SEPARATOR).trim();
}

export function deriveConversationTitle(message: string): string {
  return [...normalizeConversationTitle(message)]
    .slice(0, CONVERSATION_TITLE_MAX)
    .join('')
    .trimEnd();
}

export function isValidConversationTitle(title: string): boolean {
  const length = [...normalizeConversationTitle(title)].length;
  return length > 0 && length <= CONVERSATION_TITLE_MAX;
}
