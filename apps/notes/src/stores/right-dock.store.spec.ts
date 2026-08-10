import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRightDockStore } from './right-dock.store';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('useRightDockStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useRightDockStore.setState({ isOpen: false, hasAutoOpened: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the dock', () => {
    useRightDockStore.getState().open();
    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('closes the dock', () => {
    useRightDockStore.getState().open();
    useRightDockStore.getState().close();
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('toggle opens when closed and closes when open', () => {
    useRightDockStore.getState().toggle();
    expect(useRightDockStore.getState().isOpen).toBe(true);
    useRightDockStore.getState().toggle();
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('autoOpenOnce opens the dock and marks it as auto-opened on first call', () => {
    useRightDockStore.getState().autoOpenOnce();
    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(true);
  });

  it('autoOpenOnce does not reopen the dock after it already auto-opened', () => {
    useRightDockStore.getState().autoOpenOnce();
    useRightDockStore.getState().close();
    useRightDockStore.getState().autoOpenOnce();
    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(true);
  });

  it('persists only isOpen and hasAutoOpened to localStorage', () => {
    useRightDockStore.getState().open();
    const raw = localStorage.getItem('right-dock');
    expect(raw).not.toBeNull();
    const stored: { state: Record<string, unknown> } = JSON.parse(raw ?? '');
    expect(stored.state).toEqual({ isOpen: true, hasAutoOpened: false });
  });

  it('forces isOpen to false on rehydrate when the persisted state is open but the viewport is below desktop width', async () => {
    localStorage.setItem(
      'right-dock',
      JSON.stringify({
        state: { isOpen: true, hasAutoOpened: true },
        version: 0,
      })
    );
    stubMatchMedia(false);

    await useRightDockStore.persist.rehydrate();

    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(true);

    const raw = localStorage.getItem('right-dock');
    const stored: { state: { isOpen: boolean } } = JSON.parse(raw ?? '');
    expect(stored.state.isOpen).toBe(true);
  });

  it('keeps isOpen true on rehydrate when the persisted state is open and the viewport is desktop width', async () => {
    localStorage.setItem(
      'right-dock',
      JSON.stringify({
        state: { isOpen: true, hasAutoOpened: true },
        version: 0,
      })
    );
    stubMatchMedia(true);

    await useRightDockStore.persist.rehydrate();

    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(true);
  });
});
