import { describe, expect, it } from 'vitest';

import { NOTIFYING_ALERT_KINDS } from './catalog.types';

describe('NOTIFYING_ALERT_KINDS', () => {
  it('notifies only for an empty selector, a failed gate, a dead pin and a stale sync', () => {
    expect(NOTIFYING_ALERT_KINDS).toEqual([
      'selector_empty',
      'gate_failed',
      'pin_unavailable',
      'sync_stale',
    ]);
  });
});
