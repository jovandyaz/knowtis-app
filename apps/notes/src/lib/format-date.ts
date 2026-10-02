const INVALID_DATE_PLACEHOLDER = '—';
const ONE_OCLOCK_HOUR = '1';
const ONE_OCLOCK_CONTEXT = 'atOne';

export interface ClockTime {
  time: string;
  context?: typeof ONE_OCLOCK_CONTEXT;
}

function dateOf(dateStr: string): Date | null {
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(dateStr: string, locale: string): string {
  const date = dateOf(dateStr);
  if (!date) {
    return INVALID_DATE_PLACEHOLDER;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** The hour and minutes of an instant, in the browser's time zone. */
export function clockTimeOf(dateStr: string, locale: string): ClockTime {
  const date = dateOf(dateStr);
  if (!date) {
    return { time: INVALID_DATE_PLACEHOLDER };
  }
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const time = formatter.format(date);
  const hour = formatter
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return hour === ONE_OCLOCK_HOUR
    ? { time, context: ONE_OCLOCK_CONTEXT }
    : { time };
}
