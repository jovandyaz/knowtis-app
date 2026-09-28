import type {
  AgentStopReason,
  AiQuota,
  MessageStopReason,
} from '@knowtis/shared-types';

/** Stops a synthesis step closed at a checkpoint, leaving work a continuation can pick up. */
export const CONTINUABLE_STOP_REASONS = [
  'max_steps',
  'token_budget',
  'time_limit',
] as const satisfies readonly AgentStopReason[];

export function isContinuableStop(reason: MessageStopReason | null): boolean {
  return (
    reason !== null &&
    (CONTINUABLE_STOP_REASONS as readonly string[]).includes(reason)
  );
}

/** The caller may start one more turn now: unmetered, or at least one message left. */
export function hasMessagesLeft(quota: AiQuota | null): boolean {
  return (
    quota === null ||
    quota.messages === null ||
    quota.messages.used < quota.messages.limit
  );
}

/** A turn stopped at a checkpoint whose caller can afford the continuation; a null quota is unmetered. */
export function isContinuable(
  reason: MessageStopReason | null,
  quota: AiQuota | null
): boolean {
  return isContinuableStop(reason) && hasMessagesLeft(quota);
}
