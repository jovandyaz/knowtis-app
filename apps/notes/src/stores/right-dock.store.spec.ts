import { beforeEach, describe, expect, it } from 'vitest';

import { useRightDockStore } from './right-dock.store';

describe('useRightDockStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useRightDockStore.setState({ isOpen: false, hasAutoOpened: false });
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
});
