import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

const LOCALE_MAP: Record<string, Locale> = { es, en: enUS };

function getDateFnsLocale(locale: string): Locale {
  return LOCALE_MAP[locale.split('-')[0]] ?? enUS;
}

export function formatRelativeTime(date: Date, locale: string): string {
  const dateFnsLocale = getDateFnsLocale(locale);
  const days = differenceInDays(new Date(), date);

  if (days < 7) {
    return formatDistanceToNow(date, {
      addSuffix: true,
      locale: dateFnsLocale,
    });
  }

  return format(date, 'MMM d', { locale: dateFnsLocale });
}
