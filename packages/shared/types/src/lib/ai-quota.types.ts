import type { AccessTier } from './ai.types';

export const AI_QUOTA_EXHAUSTED_CODE = 'AI_QUOTA_EXHAUSTED';

/** The upgrade an exhausted caller is offered: register (anonymous) or bring a key. */
export type QuotaUpgrade = 'register' | 'byok';

export interface AiMessageQuota {
  used: number;
  limit: number;
  /** ISO instant of the next 00:00 UTC. */
  resetsAt: string;
}

/** `GET /ai/quota` body and `agent:quota` event body; `messages` is null for the byok tier. */
export interface AiQuota {
  tier: AccessTier;
  messages: AiMessageQuota | null;
}

export interface AgentQuotaPayload extends AiQuota {
  turnId: string;
}

/** `agent:error` body for a turn refused before any model call because today's messages are spent. */
export interface AgentQuotaExhaustedError {
  code: typeof AI_QUOTA_EXHAUSTED_CODE;
  message: string;
  resetsAt: string;
  upgrade: QuotaUpgrade;
  turnId?: string;
}

export const MAX_DAILY_MESSAGE_LIMIT = 10_000;
const DAILY_MESSAGE_LIMIT_FORMAT = /^\d{1,5}$/;

/** Parses an `ai_config` daily message limit: a whole number from 0 to `MAX_DAILY_MESSAGE_LIMIT`, or null. Shared so the API and the backoffice editor accept the same values. */
export function parseDailyMessageLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!DAILY_MESSAGE_LIMIT_FORMAT.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return parsed <= MAX_DAILY_MESSAGE_LIMIT ? parsed : null;
}

/** Remaining share of the day's messages at or below which a quota counts as running low. */
export const QUOTA_LOW_REMAINING_FRACTION = 0.2;
