import { registerDecorator, type ValidationArguments } from 'class-validator';

const IS_IANA_TIME_ZONE = 'isIanaTimeZone';
const PROBE_LOCALE = 'en-US';
const NUMERIC_OFFSET_ZONE = /^[+-]/;

function resolvesAsTimeZone(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value === '' ||
    NUMERIC_OFFSET_ZONE.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat(PROBE_LOCALE, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Accepts any zone name ICU resolves, including the IANA-primary spellings
 * Safari and Firefox report (`Asia/Kolkata`, `Europe/Kyiv`) that
 * `Intl.supportedValuesOf('timeZone')` omits in favour of its canonical links.
 * Numeric offsets (`+05:30`) are refused: ICU reads them as UTC+offset while
 * Postgres `AT TIME ZONE` reads the same string with the POSIX sign, so the
 * two day boundaries would disagree.
 */
export function IsIanaTimeZone() {
  return function registerIsIanaTimeZone(object: object, propertyName: string) {
    registerDecorator({
      name: IS_IANA_TIME_ZONE,
      target: object.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) => resolvesAsTimeZone(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be an IANA time zone name`,
      },
    });
  };
}
