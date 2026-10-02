import {
  isContinuableStop,
  type AiQuota,
  type MessageStopReason,
} from '@knowtis/shared-types';

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
