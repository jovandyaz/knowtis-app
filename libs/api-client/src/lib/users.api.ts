import { httpClient } from './http-client';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export const usersApi = {
  async updateProfile(
    input: Record<string, unknown>
  ): Promise<{ user: UserProfile }> {
    return httpClient.patch<{ user: UserProfile }>('/users/profile', input);
  },
};
