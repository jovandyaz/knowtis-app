import type { UserMemoryItem } from '@knowtis/shared-types';

import { httpClient } from './http-client';

const MEMORIES_PATH = '/agent/memories';

const memoryPath = (id: string) => `${MEMORIES_PATH}/${encodeURIComponent(id)}`;

export interface ForgetAllMemoriesResponse {
  deleted: number;
}

export const memoriesApi = {
  list(): Promise<UserMemoryItem[]> {
    return httpClient.get<UserMemoryItem[]>(MEMORIES_PATH);
  },

  async edit(id: string, content: string): Promise<void> {
    await httpClient.patch(memoryPath(id), { content });
  },

  async remove(id: string): Promise<void> {
    await httpClient.delete(memoryPath(id));
  },

  removeAll(): Promise<ForgetAllMemoriesResponse> {
    return httpClient.delete<ForgetAllMemoriesResponse>(MEMORIES_PATH);
  },
};
