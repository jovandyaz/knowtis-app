const INVALID_DATE_PLACEHOLDER = '—';

function formatWith(
  dateStr: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return INVALID_DATE_PLACEHOLDER;
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDate(dateStr: string, locale: string): string {
  return formatWith(dateStr, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** The hour and minutes of an instant, in the browser's time zone. */
export function formatTime(dateStr: string, locale: string): string {
  return formatWith(dateStr, locale, { hour: 'numeric', minute: '2-digit' });
}
