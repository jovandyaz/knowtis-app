import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { notesApi } from '@knowtis/api-client';
import { TooltipProvider } from '@knowtis/design-system';

import { ShareDialog } from './ShareDialog';

const toastSuccess = vi.fn();

vi.mock('@knowtis/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return {
    ...actual,
    notesApi: { ...actual.notesApi, update: vi.fn() },
  };
});
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

describe('ShareDialog — confirmation outlives the dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  it('announces a share that resolves after the dialog is gone', async () => {
    let settle: (() => void) | undefined;
    vi.mocked(notesApi.update).mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve({ id: 'n1' } as Awaited<
          ReturnType<typeof notesApi.update>
        >);
      })
    );

    const { unmount } = render(
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        noteId="n1"
        noteTitle="Note"
        generalAccess="restricted"
        generalAccessPermission="viewer"
        shareToken="tok"
        editorsCanShare={false}
        accessLevel="owner"
      />,
      { wrapper }
    );

    await userEvent.click(
      screen.getByRole('radio', { name: /share.anyoneWithLink/ })
    );
    await waitFor(() => expect(notesApi.update).toHaveBeenCalled());

    unmount();
    settle?.();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('share.linkResumedToast')
    );
  });
});
