/**
 * User entity types shared between frontend and backend
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'local' | 'google' | 'github';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale?: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  provider?: 'local' | 'google' | 'github';
  providerId?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string | null;
  locale?: string;
}
