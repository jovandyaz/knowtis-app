export const RETRY_AFTER_HEADER = 'Retry-After';

const MS_PER_SECOND = 1000;

/** RFC 9110 §10.2.3 delay-seconds is `1*DIGIT` — nothing else is this form. */
const DELAY_SECONDS = /^\d+$/;

/**
 * The wait a `Retry-After` header names, in milliseconds, or `undefined` when
 * the response gave no usable guidance.
 *
 * Only RFC 9110's delta-seconds form is honoured. The HTTP-date form is read
 * as no guidance on purpose: resolving it needs the client clock, and a clock
 * running behind would hold an action back far longer than the server asked,
 * whereas falling back to the caller's own window is always survivable. An
 * unusable value therefore degrades to `undefined`, never to `NaN`.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined
): number | undefined {
  if (headerValue == null || !DELAY_SECONDS.test(headerValue.trim())) {
    return undefined;
  }

  const ms = Number(headerValue) * MS_PER_SECOND;

  return ms > 0 && Number.isSafeInteger(ms) ? ms : undefined;
}
