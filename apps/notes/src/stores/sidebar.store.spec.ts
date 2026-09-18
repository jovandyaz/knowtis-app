import { beforeEach, describe, expect, it } from 'vitest';

import { useSidebarStore } from './sidebar.store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, width: 0 });
    localStorage.clear();
  });

  it('starts expanded with no measured width', () => {
    expect(useSidebarStore.getState().collapsed).toBe(false);
    expect(useSidebarStore.getState().width).toBe(0);
  });

  it('flips the collapsed state on toggle', () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);

    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('records the collapsed state and the width the panel renders at', () => {
    useSidebarStore.getState().setCollapsed(true);
    useSidebarStore.getState().setWidth(300);

    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(useSidebarStore.getState().width).toBe(300);
  });

  it('keeps the width a drag streams through out of storage', () => {
    for (const width of [300, 301, 302]) {
      useSidebarStore.getState().setWidth(width);
    }
    useSidebarStore.getState().setCollapsed(true);

    expect(localStorage.length).toBe(0);
  });
});
