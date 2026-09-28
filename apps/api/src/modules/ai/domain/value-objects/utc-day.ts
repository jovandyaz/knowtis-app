const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

/** One UTC calendar day, the bucket every daily AI counter resets on. */
export interface UtcDay {
  /** `YYYY-MM-DD`, the suffix of the day's counter keys. */
  readonly key: string;
  readonly start: Date;
  /** The next 00:00 UTC. */
  readonly resetsAt: Date;
}

export function utcDayOf(now: Date): UtcDay {
  const startMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const start = new Date(startMs);
  return {
    key: start.toISOString().slice(0, ISO_DATE_LENGTH),
    start,
    resetsAt: new Date(startMs + MS_PER_DAY),
  };
}
