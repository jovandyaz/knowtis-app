import type {
  ConversationPage,
  ConversationTranscript,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

const CONVERSATIONS_PATH = '/agent/conversations';

export interface ConversationPageRequest {
  page: number;
  limit: number;
}

const conversationPath = (id: string) =>
  `${CONVERSATIONS_PATH}/${encodeURIComponent(id)}`;

export const conversationsApi = {
  list({ page, limit }: ConversationPageRequest): Promise<ConversationPage> {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return httpClient.get<ConversationPage>(
      `${CONVERSATIONS_PATH}?${query.toString()}`
    );
  },

  transcript(
    id: string,
    signal?: AbortSignal
  ): Promise<ConversationTranscript> {
    return httpClient.get<ConversationTranscript>(
      `${conversationPath(id)}/messages`,
      signal ? { signal } : undefined
    );
  },

  async rename(id: string, title: string): Promise<void> {
    await httpClient.patch(conversationPath(id), { title });
  },

  async remove(id: string): Promise<void> {
    await httpClient.delete(conversationPath(id));
  },
};
