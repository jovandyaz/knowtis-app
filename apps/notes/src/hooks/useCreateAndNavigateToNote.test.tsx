import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ROUTES } from '@/config';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

import type * as ApiClientModule from '@knowtis/api-client';
import { ApiClientError } from '@knowtis/api-client';
import { useArtifacts } from '@knowtis/data-access-artifacts';
import type * as DataAccessNotesModule from '@knowtis/data-access-notes';
import { notesQueryKeys, useNote } from '@knowtis/data-access-notes';
import { ANONYMOUS_NOTE_LIMIT_CODE } from '@knowtis/shared-types';
import type * as SharedUtilModule from '@knowtis/shared-util';

import { useCreateAndNavigateToNote } from './useCreateAndNavigateToNote';

const { captureProductEvent, navigate, getNote, getArtifacts } = vi.hoisted(
  () => ({
    captureProductEvent: vi.fn(),
    navigate: vi.fn(),
    getNote: vi.fn(),
    getArtifacts: vi.fn(),
  })
);
const mutateAsync = vi.fn();
const authUser = vi.fn<() => { id: string; isAnonymous: boolean }>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@jovandyaz/auth-react', () => ({ useAuthUser: () => authUser() }));
vi.mock('@knowtis/shared-util', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedUtilModule>()),
  generateId: () => 'note-1',
}));
vi.mock('@knowtis/data-access-notes', async (importOriginal) => ({
  ...(await importOriginal<typeof DataAccessNotesModule>()),
  useCreateNote: () => ({ mutateAsync }),
}));
vi.mock('@knowtis/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    notesApi: { ...actual.notesApi, getById: getNote },
    artifactsApi: { ...actual.artifactsApi, getAll: getArtifacts },
  };
});
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('useCreateAndNavigateToNote analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigate.mockResolvedValue(undefined);
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

  it('hands a guest past the note limit to onLimitReached instead of failing', async () => {
    const consoleError = vi.spyOn(console, 'error');
    mutateAsync.mockRejectedValue(
      new ApiClientError(
        'Guest note limit reached',
        403,
        ANONYMOUS_NOTE_LIMIT_CODE
      )
    );
    const onLimitReached = vi.fn();
    const { result } = renderHook(() => useCreateAndNavigateToNote(), {
      wrapper,
    });

    await act(async () => result.current({ onLimitReached }));

    await waitFor(() => expect(onLimitReached).toHaveBeenCalledTimes(1));
    expect(consoleError).not.toHaveBeenCalled();
    expect(captureProductEvent).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('useCreateAndNavigateToNote when the note is refused', () => {
  const NOTE_ID = 'note-1';
  const useRoute = create<{ onNotePage: boolean }>(() => ({
    onNotePage: false,
  }));

  function NotePage() {
    useNote(NOTE_ID);
    useArtifacts(NOTE_ID);
    return null;
  }

  function routerWrapper(queryClient: QueryClient) {
    return function Router({ children }: { children: ReactNode }) {
      const onNotePage = useRoute((s) => s.onNotePage);
      return (
        <QueryClientProvider client={queryClient}>
          {onNotePage && <NotePage />}
          {children}
        </QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useRoute.setState({ onNotePage: false });
    authUser.mockReturnValue({ id: 'user-1', isAnonymous: true });
    navigate.mockImplementation(({ to }: { to: string }) => {
      if (to === ROUTES.NOTE) {
        useRoute.setState({ onNotePage: true });
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'past the guest note limit',
      new ApiClientError(
        'Guest note limit reached',
        403,
        ANONYMOUS_NOTE_LIMIT_CODE
      ),
      [],
    ],
    ['for any other reason', new Error('failed'), [['create.failedToCreate']]],
  ])(
    'drops the note refused %s without the page still showing it fetching it again',
    async (_, error, toasts) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mutateAsync.mockRejectedValue(error);
      const queryClient = new QueryClient();
      const { result, rerender } = renderHook(
        () => useCreateAndNavigateToNote(),
        { wrapper: routerWrapper(queryClient) }
      );

      await act(async () => result.current({ onLimitReached: vi.fn() }));
      await waitFor(() =>
        expect(navigate).toHaveBeenLastCalledWith({
          to: ROUTES.DASHBOARD,
          replace: true,
        })
      );
      await act(async () => rerender());

      expect(getNote).not.toHaveBeenCalled();
      expect(getArtifacts).not.toHaveBeenCalled();
      expect(vi.mocked(toast.error).mock.calls).toEqual(toasts);

      act(() => useRoute.setState({ onNotePage: false }));

      expect(
        queryClient.getQueryState(notesQueryKeys.detail(NOTE_ID))
      ).toBeUndefined();
    }
  );
});
