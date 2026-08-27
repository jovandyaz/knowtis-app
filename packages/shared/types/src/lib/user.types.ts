/**
 * User entity types shared between frontend and backend
 */

/**
 * Error code the four HTTP verified-email gates answer with. The frontend
 * opens its verification dialog on it.
 */
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';

/**
 * The copilot's own refusal, delivered over the agent socket rather than as an
 * HTTP response. It lives here so the emitter and the message table that reads
 * it cannot drift apart under a rename.
 */
export const AGENT_EMAIL_NOT_VERIFIED_CODE = 'AGENT_EMAIL_NOT_VERIFIED';

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
