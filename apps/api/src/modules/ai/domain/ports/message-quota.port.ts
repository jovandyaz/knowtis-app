import type { UtcDay } from '../value-objects/utc-day';

/** Every subject a turn is metered under; the first is the caller's own and scopes the turn marker. */
export type QuotaSubjects = readonly [string, ...string[]];

export interface QuotaTurn {
  readonly subjects: QuotaSubjects;
  readonly turnId: string;
  readonly day: UtcDay;
}

export type QuotaConsumeResult =
  | {
      readonly allowed: true;
      readonly used: number;
      readonly replayed: boolean;
    }
  | { readonly allowed: false; readonly used: number };

/**
 * Daily message counters. A turn consumes only when every subject is under the
 * limit, and one turn id consumes at most once per caller and day. `used` is
 * the highest count among the subjects.
 */
export interface MessageQuotaPort {
  consume(turn: QuotaTurn, limit: number): Promise<QuotaConsumeResult>;
  /** True when the turn had consumed and got its message back; a turn that never consumed is left alone. */
  refund(turn: QuotaTurn): Promise<boolean>;
  usage(subjects: QuotaSubjects, day: UtcDay): Promise<number>;
}

export const MESSAGE_QUOTA_PORT = Symbol('MESSAGE_QUOTA_PORT');

/** The fallback for a registered caller when the counters are unreachable: the user rows it persisted today. */
export interface UserMessageCountPort {
  countUserMessages(userId: string, day: UtcDay): Promise<number>;
}

export const USER_MESSAGE_COUNT_PORT = Symbol('USER_MESSAGE_COUNT_PORT');
