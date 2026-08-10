import { useAIStore } from '@/stores/ai.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '@knowtis/shared-hooks';

import { useCopilotAutoOpen } from './useCopilotAutoOpen';

vi.mock('@knowtis/shared-hooks', () => ({ useMediaQuery: vi.fn() }));

describe('useCopilotAutoOpen', () => {
  beforeEach(() => {
    localStorage.clear();
    useRightDockStore.setState({ isOpen: false, hasAutoOpened: false });
    useAIStore.setState({ aiEnabled: true });
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  it('auto-opens the dock on first note visit when desktop and AI enabled', () => {
    renderHook(() => useCopilotAutoOpen());
    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(true);
  });

  it('does not open again once the dock has auto-opened before', () => {
    useRightDockStore.setState({ isOpen: false, hasAutoOpened: true });
    renderHook(() => useCopilotAutoOpen());
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('does not open nor set the flag when AI is disabled', () => {
    useAIStore.setState({ aiEnabled: false });
    renderHook(() => useCopilotAutoOpen());
    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(false);
  });

  it('does not open nor set the flag on mobile viewports', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    renderHook(() => useCopilotAutoOpen());
    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(useRightDockStore.getState().hasAutoOpened).toBe(false);
  });
});
