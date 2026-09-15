import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import {
  useStudyKeyboard,
  type StudyKeyboardOptions,
} from './useStudyKeyboard';

function options(
  overrides: Partial<StudyKeyboardOptions> = {}
): StudyKeyboardOptions {
  return {
    enabled: true,
    insideFocusDialog: false,
    isAdvancedMode: false,
    flipped: false,
    isBusy: () => false,
    onFlip: vi.fn(),
    onNavigate: vi.fn(),
    onRate: vi.fn(),
    ...overrides,
  };
}

const press = (key: string, target: Element | Document = document.body) =>
  fireEvent.keyDown(target, { key });

beforeEach(() => vi.clearAllMocks());

describe('useStudyKeyboard', () => {
  it('flips on Space and Enter', () => {
    const opts = options();
    renderHook(() => useStudyKeyboard(opts));
    press(' ');
    press('Enter');
    expect(opts.onFlip).toHaveBeenCalledTimes(2);
  });

  it('leaves Space to a focused button, which flips natively', () => {
    const opts = options();
    renderHook(() => useStudyKeyboard(opts));
    const button = document.createElement('button');
    document.body.append(button);
    press(' ', button);
    expect(opts.onFlip).not.toHaveBeenCalled();
    button.remove();
  });

  it('navigates with the arrow keys', () => {
    const opts = options();
    renderHook(() => useStudyKeyboard(opts));
    press('ArrowLeft');
    press('ArrowRight');
    expect(opts.onNavigate).toHaveBeenNthCalledWith(1, -1);
    expect(opts.onNavigate).toHaveBeenNthCalledWith(2, 1);
  });

  it('rates only once the card is flipped', () => {
    const hidden = options({ flipped: false });
    const { rerender } = renderHook(
      (o: StudyKeyboardOptions) => useStudyKeyboard(o),
      {
        initialProps: hidden,
      }
    );
    press('2');
    expect(hidden.onRate).not.toHaveBeenCalled();
    rerender(options({ flipped: true, onRate: hidden.onRate }));
    press('2');
    expect(hidden.onRate).toHaveBeenCalledWith(SM2_QUALITY.GOOD);
  });

  it('maps 3 and 4 to good and easy in advanced mode', () => {
    const opts = options({ flipped: true, isAdvancedMode: true });
    renderHook(() => useStudyKeyboard(opts));
    press('3');
    expect(opts.onRate).toHaveBeenCalledWith(SM2_QUALITY.GOOD);
    press('4');
    expect(opts.onRate).toHaveBeenCalledWith(SM2_QUALITY.EASY);
  });

  it('does nothing while a review is in flight or when disabled', () => {
    const busy = options({ isBusy: () => true });
    renderHook(() => useStudyKeyboard(busy));
    press(' ');
    expect(busy.onFlip).not.toHaveBeenCalled();
    const off = options({ enabled: false });
    renderHook(() => useStudyKeyboard(off));
    press(' ');
    expect(off.onFlip).not.toHaveBeenCalled();
  });
});
