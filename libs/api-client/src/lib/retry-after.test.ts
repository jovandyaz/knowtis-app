import { describe, expect, it } from 'vitest';

import { parseRetryAfterMs } from './retry-after';

describe('parseRetryAfterMs', () => {
  it('reads the delta-seconds form the API sends', () => {
    expect(parseRetryAfterMs('5')).toBe(5_000);
    expect(parseRetryAfterMs('60')).toBe(60_000);
    expect(parseRetryAfterMs('900')).toBe(900_000);
  });

  it('tolerates the surrounding whitespace a proxy may add', () => {
    expect(parseRetryAfterMs(' 5 ')).toBe(5_000);
  });

  it('reports no guidance when the response carried no header', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('   ')).toBeUndefined();
  });

  it('reports no guidance for the HTTP-date form rather than NaN', () => {
    // A past date reads as an elapsed wait to any implementation, so only a
    // future one pins the decision to leave the date form unparsed.
    const fiveMinutesOut = new Date(Date.now() + 5 * 60_000).toUTCString();

    expect(parseRetryAfterMs(fiveMinutesOut)).toBeUndefined();
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT')).toBeUndefined();
  });

  it('reports no guidance for a wait that is already over', () => {
    expect(parseRetryAfterMs('0')).toBeUndefined();
    expect(parseRetryAfterMs('-5')).toBeUndefined();
  });

  it('reports no guidance for a value delta-seconds cannot express', () => {
    expect(parseRetryAfterMs('1.5')).toBeUndefined();
    expect(parseRetryAfterMs('1e3')).toBeUndefined();
    expect(parseRetryAfterMs('0x10')).toBeUndefined();
    expect(parseRetryAfterMs('5s')).toBeUndefined();
    expect(parseRetryAfterMs('soon')).toBeUndefined();
    expect(parseRetryAfterMs('Infinity')).toBeUndefined();
  });

  it('reports no guidance for a wait too large to compute a deadline from', () => {
    expect(parseRetryAfterMs('99999999999999999999')).toBeUndefined();
  });
});
