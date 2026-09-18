import { beforeEach, describe, expect, it } from 'vitest';

import { useSidebarStore } from './sidebar.store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, visibleWidth: 0 });
    localStorage.clear();
  });

  it('starts expanded with no visible width', () => {
    expect(useSidebarStore.getState().collapsed).toBe(false);
    expect(useSidebarStore.getState().visibleWidth).toBe(0);
  });

  it('flips the collapsed state on toggle', () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);

    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('records the collapsed state and the visible width', () => {
    useSidebarStore.getState().setCollapsed(true);
    useSidebarStore.getState().setVisibleWidth(300);

    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(useSidebarStore.getState().visibleWidth).toBe(300);
  });

  it('keeps the visible width out of storage', () => {
    useSidebarStore.getState().setVisibleWidth(300);
    useSidebarStore.getState().setCollapsed(true);

    expect(localStorage.length).toBe(0);
  });
});
