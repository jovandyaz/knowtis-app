import { beforeEach, describe, expect, it } from 'vitest';

import { useRightDockStore } from './right-dock.store';

describe('useRightDockStore', () => {
  beforeEach(() => {
    useRightDockStore.setState({ isOpen: false, activeTab: 'copilot' });
  });

  it('opens to the requested tab', () => {
    useRightDockStore.getState().open('estudio');
    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().activeTab).toBe('estudio');
  });

  it('toggle on the active open tab closes the dock', () => {
    useRightDockStore.getState().open('copilot');
    useRightDockStore.getState().toggle('copilot');
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('toggle on a different tab switches without closing', () => {
    useRightDockStore.getState().open('copilot');
    useRightDockStore.getState().toggle('estudio');
    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().activeTab).toBe('estudio');
  });

  it('setTab switches the tab without changing open state', () => {
    useRightDockStore.getState().setTab('estudio');
    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(useRightDockStore.getState().activeTab).toBe('estudio');
  });

  it('toggle when closed opens the dock on the given tab', () => {
    useRightDockStore.setState({ isOpen: false, activeTab: 'estudio' });
    useRightDockStore.getState().toggle('copilot');
    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().activeTab).toBe('copilot');
  });
});
