import { describe, expect, it } from 'vitest';

import { registrableHostOf } from './registrable-host';

describe('registrableHostOf', () => {
  it.each([
    ['a two-label host as it is', 'evil.example', 'evil.example'],
    ['a single-label host as it is', 'intranet', 'intranet'],
    [
      'deeper labels folded into *.',
      'secret-payload.a.evil.example',
      '*.evil.example',
    ],
    ['an IPv4 address whole', '169.254.169.254', '169.254.169.254'],
    ['a bracketed IPv6 address whole', '[fd00::1]', '[fd00::1]'],
    ['an overlong registrable part as *', `${'x'.repeat(64)}.example`, '*'],
  ])('keeps %s', (_label, hostname, expected) => {
    expect(registrableHostOf(hostname)).toBe(expected);
  });
});
