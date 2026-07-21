import { beforeEach, describe, expect, it } from 'vitest';

import { useRightDockStore } from './right-dock.store';

describe('useRightDockStore', () => {
  beforeEach(() => {
    useRightDockStore.setState({ isOpen: false });
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
});
