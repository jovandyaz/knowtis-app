import { describe, expect, it } from 'vitest';

import { accessFor } from './model-access.policy';
import { CURATED_MODELS } from './selectable-models.catalog';

const open = CURATED_MODELS.find((m) => m.tier === 'open')!;
const premium = CURATED_MODELS.find((m) => m.tier !== 'open')!;
const NONE: ReadonlySet<string> = new Set();

describe('accessFor', () => {
  it('should grant everything while the flag is off', () => {
    expect(accessFor(premium, NONE, false)).toBe('granted');
  });

  it('should grant the open tier to users without any key', () => {
    expect(accessFor(open, NONE, true)).toBe('granted');
  });

  it('should gate a premium tier behind the caller’s own provider key', () => {
    expect(accessFor(premium, NONE, true)).toBe('requires_byok');
    expect(accessFor(premium, new Set([premium.id.split(':')[0]]), true)).toBe(
      'granted'
    );
  });
});
