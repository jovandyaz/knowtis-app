import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStudyFocusMode } from './useStudyFocusMode';

describe('useStudyFocusMode', () => {
  beforeEach(() => {
    localStorage.clear();
    useRightDockStore.setState({ isOpen: false, hasAutoOpened: false });
    useSidebarStore.setState({ collapsed: false });
  });

  it('closes an open dock on mount and reopens it on unmount', () => {
    useRightDockStore.setState({ isOpen: true });

    const { unmount } = renderHook(() => useStudyFocusMode());

    expect(useRightDockStore.getState().isOpen).toBe(false);

    unmount();

    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('leaves an already-closed dock closed after unmount', () => {
    useRightDockStore.setState({ isOpen: false });

    const { unmount } = renderHook(() => useStudyFocusMode());

    expect(useRightDockStore.getState().isOpen).toBe(false);

    unmount();

    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('collapses an expanded sidebar on mount and restores it on unmount', () => {
    useSidebarStore.setState({ collapsed: false });

    const { unmount } = renderHook(() => useStudyFocusMode());

    expect(useSidebarStore.getState().collapsed).toBe(true);

    unmount();

    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('leaves an already-collapsed sidebar collapsed after unmount', () => {
    useSidebarStore.setState({ collapsed: true });

    const { unmount } = renderHook(() => useStudyFocusMode());

    expect(useSidebarStore.getState().collapsed).toBe(true);

    unmount();

    expect(useSidebarStore.getState().collapsed).toBe(true);
  });
});
