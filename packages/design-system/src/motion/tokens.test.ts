import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MOTION_DURATION_S, MOTION_EASING } from './tokens';

const motion = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../tokens/motion.json'), 'utf8')
).motion;

const MS_PER_SECOND = 1000;

describe('motion tokens', () => {
  it('keeps the duration keys in sync with the token source', () => {
    expect(Object.keys(motion.duration).sort()).toEqual(
      Object.keys(MOTION_DURATION_S).sort()
    );
  });

  it('keeps the easing keys in sync with the token source', () => {
    expect(Object.keys(motion.easing).sort()).toEqual(
      Object.keys(MOTION_EASING).sort()
    );
  });

  it.each(Object.keys(MOTION_DURATION_S) as (keyof typeof MOTION_DURATION_S)[])(
    'keeps the %s duration equal to the token source',
    (name) => {
      const css: string = motion.duration[name].value;
      expect(css).toMatch(/^\d+ms$/);
      expect(parseInt(css, 10) / MS_PER_SECOND).toBe(MOTION_DURATION_S[name]);
    }
  );

  it.each(Object.keys(MOTION_EASING) as (keyof typeof MOTION_EASING)[])(
    'keeps the %s easing equal to the token source',
    (name) => {
      expect(motion.easing[name].value).toBe(
        `cubic-bezier(${MOTION_EASING[name].join(', ')})`
      );
    }
  );
});
