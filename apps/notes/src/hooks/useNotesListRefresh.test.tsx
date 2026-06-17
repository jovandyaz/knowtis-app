import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DEBOUNCE_DELAYS } from '@/lib';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notesQueryKeys } from '@knowtis/data-access-notes';

import { useNotesListRefresh } from './useNotesListRefresh';

describe('useNotesListRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces rapid calls into a single notes-list invalidation', () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useNotesListRefresh(), { wrapper });

    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DEBOUNCE_DELAYS.AUTO_SAVE));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: notesQueryKeys.lists(),
    });
  });
});
