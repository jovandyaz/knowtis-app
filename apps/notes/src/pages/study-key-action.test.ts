import { describe, expect, it } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { resolveStudyKeyAction } from './study-key-action';

describe('resolveStudyKeyAction', () => {
  it('flips on Space and Enter in both modes', () => {
    for (const key of [' ', 'Enter']) {
      expect(resolveStudyKeyAction(key, false)).toEqual({ type: 'flip' });
      expect(resolveStudyKeyAction(key, true)).toEqual({ type: 'flip' });
    }
  });

  it('navigates with the arrow keys in both modes', () => {
    for (const isAdvancedMode of [false, true]) {
      expect(resolveStudyKeyAction('ArrowLeft', isAdvancedMode)).toEqual({
        type: 'navigate',
        direction: -1,
      });
      expect(resolveStudyKeyAction('ArrowRight', isAdvancedMode)).toEqual({
        type: 'navigate',
        direction: 1,
      });
    }
  });

  it('maps 1/2 to wrong/correct in simple mode', () => {
    expect(resolveStudyKeyAction('1', false)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.AGAIN,
    });
    expect(resolveStudyKeyAction('2', false)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.GOOD,
    });
  });

  it('ignores 3 and 4 in simple mode', () => {
    expect(resolveStudyKeyAction('3', false)).toBeUndefined();
    expect(resolveStudyKeyAction('4', false)).toBeUndefined();
  });

  it('maps 1-4 to Again/Hard/Good/Easy in advanced mode', () => {
    expect(resolveStudyKeyAction('1', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.AGAIN,
    });
    expect(resolveStudyKeyAction('2', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.HARD,
    });
    expect(resolveStudyKeyAction('3', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.GOOD,
    });
    expect(resolveStudyKeyAction('4', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.EASY,
    });
  });

  it('ignores an unrelated key in both modes', () => {
    expect(resolveStudyKeyAction('a', false)).toBeUndefined();
    expect(resolveStudyKeyAction('a', true)).toBeUndefined();
  });
});
