import { describe, expect, it } from 'vitest';

import { buttonVariants } from '../components/Button';
import { TOUCH_TARGET_CLASS, TOUCH_TARGET_HEIGHT_CLASS } from './touch-target';

describe('TOUCH_TARGET_CLASS', () => {
  it('floors both dimensions at 44px behind a coarse pointer', () => {
    expect(TOUCH_TARGET_CLASS.split(' ')).toEqual([
      'pointer-coarse:min-h-11',
      'pointer-coarse:min-w-11',
    ]);
  });

  it('builds on the height-only floor so the two never drift', () => {
    expect(TOUCH_TARGET_CLASS.split(' ')).toContain(TOUCH_TARGET_HEIGHT_CLASS);
  });

  it('states the same policy the Button base already enforces', () => {
    expect(buttonVariants().split(' ')).toEqual(
      expect.arrayContaining(TOUCH_TARGET_CLASS.split(' '))
    );
  });
});
