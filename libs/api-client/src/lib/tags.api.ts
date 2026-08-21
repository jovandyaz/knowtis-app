import type { TagNode } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export interface UpdateTagInput {
  path?: string;
  color?: string | null;
}

export const tagsApi = {
  /** The caller's whole vocabulary, ordered by path, each node counted with its descendants. */
  async getAll(): Promise<TagNode[]> {
    return httpClient.get<TagNode[]>('/tags');
  },

  async update(id: string, input: UpdateTagInput): Promise<void> {
    await httpClient.patch<null>(`/tags/${encodeURIComponent(id)}`, input);
  },

  async delete(id: string): Promise<void> {
    await httpClient.delete<null>(`/tags/${encodeURIComponent(id)}`);
  },
};
