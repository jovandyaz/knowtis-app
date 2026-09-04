import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateAndNavigateToNote } from './useCreateAndNavigateToNote';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));
const mutateAsync = vi.fn();
const authUser = vi.fn<() => { id: string; isAnonymous: boolean }>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@jovandyaz/auth-react', () => ({ useAuthUser: () => authUser() }));
vi.mock('@knowtis/shared-util', () => ({ generateId: () => 'note-1' }));
vi.mock('@knowtis/data-access-notes', () => ({
  dropLoadedNote: (notes: unknown) => notes,
  notesQueryKeys: {
    detail: (noteId: string) => ['notes', 'detail', noteId],
    lists: () => ['notes', 'list'],
  },
  prependLoadedNote: (notes: unknown) => notes,
  useCreateNote: () => ({ mutateAsync }),
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('useCreateAndNavigateToNote analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser.mockReturnValue({ id: 'user-1', isAnonymous: true });
  });

  it('captures confirmed anonymous note creation', async () => {
    mutateAsync.mockResolvedValue({});
    const { result } = renderHook(() => useCreateAndNavigateToNote(), {
      wrapper,
    });

    act(() => result.current({ onLimitReached: vi.fn() }));

    await waitFor(() =>
      expect(captureProductEvent).toHaveBeenCalledWith('note created', {
        source: 'browser',
        actor_type: 'anonymous',
      })
    );
    expect(captureProductEvent).toHaveBeenCalledTimes(1);
  });

  it('does not capture registered note creation', async () => {
    authUser.mockReturnValue({ id: 'user-1', isAnonymous: false });
    mutateAsync.mockResolvedValue({});
    const { result } = renderHook(() => useCreateAndNavigateToNote(), {
      wrapper,
    });

    await act(async () => result.current({ onLimitReached: vi.fn() }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not capture failed anonymous note creation', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mutateAsync.mockRejectedValue(new Error('failed'));
    const { result } = renderHook(() => useCreateAndNavigateToNote(), {
      wrapper,
    });

    await act(async () => result.current({ onLimitReached: vi.fn() }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
    expect(captureProductEvent).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
