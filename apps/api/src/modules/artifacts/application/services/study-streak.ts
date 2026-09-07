const DATE_KEY_LENGTH = 10;
const DAYS_BACK_ONE = -1;

/** Calendar day (`YYYY-MM-DD`) of `now` in the given IANA time zone. */
export function localDateKey(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + deltaDays))
    .toISOString()
    .slice(0, DATE_KEY_LENGTH);
}

/**
 * Length of the run of consecutive active days ending today, or ending yesterday
 * when today has no activity yet. `activeDays` are `YYYY-MM-DD` keys in any order.
 */
export function computeStreak(
  activeDays: readonly string[],
  today: string
): number {
  const active = new Set(activeDays);
  let cursor = today;

  if (!active.has(cursor)) {
    cursor = shiftDateKey(cursor, DAYS_BACK_ONE);
    if (!active.has(cursor)) {
      return 0;
    }
  }

  let streak = 0;
  while (active.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, DAYS_BACK_ONE);
  }
  return streak;
}
