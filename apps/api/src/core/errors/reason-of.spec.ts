import { describe, expect, it } from 'vitest';

import { reasonOf } from './reason-of';

describe('reasonOf', () => {
  it('reads the message of an Error', () => {
    expect(reasonOf(new TypeError('connection reset'))).toBe(
      'connection reset'
    );
  });

  it('stringifies anything else that was thrown', () => {
    expect(reasonOf('timeout')).toBe('timeout');
    expect(reasonOf(undefined)).toBe('undefined');
  });
});
