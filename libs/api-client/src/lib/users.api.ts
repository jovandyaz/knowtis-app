import type { UserProfile } from '@knowtis/shared-types';

import { httpClient } from './http-client';

export type { UserProfile };

export interface UpdateProfileInput {
  name?: string | undefined;
  avatarUrl?: string | undefined;
  locale?: string | undefined;
}

export const usersApi = {
  async updateProfile(
    input: UpdateProfileInput
  ): Promise<{ user: UserProfile }> {
    return httpClient.patch<{ user: UserProfile }>('/users/profile', input);
  },
};
