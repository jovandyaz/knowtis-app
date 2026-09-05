import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDocumentDarkTheme } from './useDocumentDarkTheme';

const DARK_CLASS = 'dark';

afterEach(() => {
  // vitest runs afterEach hooks last-registered-first, so the hook is still
  // mounted here: unmount before mutating the class its observer watches
  cleanup();
  document.documentElement.classList.remove(DARK_CLASS);
});

describe('useDocumentDarkTheme', () => {
  it('reports false when the document is light', () => {
    const { result } = renderHook(() => useDocumentDarkTheme());

    expect(result.current).toBe(false);
  });

  it('reports true when the document carries the dark class', () => {
    document.documentElement.classList.add(DARK_CLASS);

    const { result } = renderHook(() => useDocumentDarkTheme());

    expect(result.current).toBe(true);
  });

  it('reacts when the theme flips while mounted', async () => {
    const { result } = renderHook(() => useDocumentDarkTheme());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.classList.add(DARK_CLASS);
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });
});
