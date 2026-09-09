import { describe, expect, it } from 'vitest';

import { buttonVariants } from '../components/Button';
import { TOUCH_TARGET_CLASS } from './touch-target';

describe('TOUCH_TARGET_CLASS', () => {
  it('gates the 44px floor on a coarse pointer', () => {
    expect(TOUCH_TARGET_CLASS).toBe('pointer-coarse:min-h-11');
  });

  it('states the same policy the Button base already enforces', () => {
    expect(buttonVariants().split(' ')).toContain(TOUCH_TARGET_CLASS);
  });
});
