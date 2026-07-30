import { act } from '@testing-library/react';
import { vi } from 'vitest';

const changeListeners = new Set<() => void>();
let desktopViewport = false;

function matchMediaStub(query: string) {
  return {
    matches: desktopViewport,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      changeListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      changeListeners.delete(listener);
    },
    addListener: (listener: () => void) => {
      changeListeners.add(listener);
    },
    removeListener: (listener: () => void) => {
      changeListeners.delete(listener);
    },
    dispatchEvent: () => false,
  };
}

function stubViewport(matches: boolean) {
  desktopViewport = matches;
  vi.stubGlobal('matchMedia', matchMediaStub);
  act(() => {
    for (const notify of [...changeListeners]) {
      notify();
    }
  });
}

/**
 * Stubs `window.matchMedia` as `md`-and-up. Safe to call after mounting — like a
 * real rotation it notifies live `useMediaQuery` subscribers. Pair with
 * `vi.unstubAllGlobals()`.
 */
export const stubDesktopViewport = () => stubViewport(true);

/** Below-`md` counterpart of {@link stubDesktopViewport}. */
export const stubPhoneViewport = () => stubViewport(false);
