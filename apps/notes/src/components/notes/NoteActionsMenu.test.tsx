import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAnonymousLimitStore } from '@/stores/anonymous-limit.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import { ANONYMOUS_NOTE_LIMIT_CODE } from '@knowtis/shared-types';

import { NoteActionsMenu } from './NoteActionsMenu';

const deleteMutate = vi.fn();
const restoreMutate = vi.fn();
const navigate = vi.fn();
const toastFn = vi.fn();
const toastError = vi.fn();
const params = vi.fn<() => { noteId?: string }>();

vi.mock('@knowtis/data-access-notes', () => ({
  useDeleteNote: () => ({ mutate: deleteMutate }),
  useRestoreNote: () => ({ mutate: restoreMutate }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => params(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastFn(...a), {
    error: (...a: unknown[]) => toastError(...a),
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { title?: string }) => {
      const dictionary: Record<string, string> = {
        'delete.button': 'Delete',
        'delete.deleted': 'Note deleted',
        'delete.undo': 'Undo',
        'delete.error': 'Delete failed',
        'delete.undoError': 'Restore failed',
        'delete.menuLabel': `Options for ${opts?.title ?? ''}`,
      };
      return dictionary[key] ?? key;
    },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('NoteActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.mockReturnValue({});
    useAnonymousLimitStore.setState({ showModal: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the menu and deletes with an undo toast', async () => {
    const user = userEvent.setup();
    render(<NoteActionsMenu noteId="n1" noteTitle="My note" />, { wrapper });

    await user.click(
      screen.getByRole('button', { name: /options for my note/i })
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    expect(deleteMutate).toHaveBeenCalledWith('n1', expect.any(Object));
  });

  it('fires a toast with a working undo action on delete', async () => {
    const user = userEvent.setup();
    render(<NoteActionsMenu noteId="n1" noteTitle="My note" />, { wrapper });

    await user.click(
      screen.getByRole('button', { name: /options for my note/i })
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const [, options] = deleteMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    options.onSuccess();

    expect(toastFn).toHaveBeenCalledTimes(1);
    const [message, config] = toastFn.mock.calls[0] as [
      string,
      { action: { onClick: () => void }; duration: number },
    ];
    expect(message).toBe('Note deleted');
    expect(navigate).not.toHaveBeenCalled();

    config.action.onClick();
    expect(restoreMutate).toHaveBeenCalledWith('n1', expect.any(Object));
  });

  it('redirects to the notes list when the deleted note is the open one', async () => {
    params.mockReturnValue({ noteId: 'n1' });
    const user = userEvent.setup();
    render(<NoteActionsMenu noteId="n1" noteTitle="My note" />, { wrapper });

    await user.click(
      screen.getByRole('button', { name: /options for my note/i })
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const [, options] = deleteMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    options.onSuccess();

    expect(navigate).toHaveBeenCalledWith({ to: '/notes' });
  });

  it('shows an error toast when the delete fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new Error('offline');
    const user = userEvent.setup();
    render(<NoteActionsMenu noteId="n1" noteTitle="My note" />, { wrapper });

    await user.click(
      screen.getByRole('button', { name: /options for my note/i })
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const [, options] = deleteMutate.mock.calls[0] as [
      string,
      { onError: (error: unknown) => void },
    ];
    options.onError(failure);

    expect(consoleError).toHaveBeenCalledWith(
      '[NoteActionsMenu] Failed to delete note:',
      failure
    );
    expect(toastError).toHaveBeenCalledWith('Delete failed');
  });

  async function undoTheDelete() {
    const user = userEvent.setup();
    render(<NoteActionsMenu noteId="n1" noteTitle="My note" />, { wrapper });

    await user.click(
      screen.getByRole('button', { name: /options for my note/i })
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const [, deleteOptions] = deleteMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    deleteOptions.onSuccess();

    const [, config] = toastFn.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    config.action.onClick();

    const [, restoreOptions] = restoreMutate.mock.calls[0] as [
      string,
      { onError: (error: unknown) => void },
    ];
    return restoreOptions.onError;
  }

  it('shows an error toast when the undo restore fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new ApiClientError('Internal server error', 500);
    const failRestore = await undoTheDelete();

    failRestore(failure);

    expect(consoleError).toHaveBeenCalledWith(
      '[NoteActionsMenu] Failed to restore note:',
      failure
    );
    expect(toastError).toHaveBeenCalledWith('Restore failed');
    expect(useAnonymousLimitStore.getState().showModal).toBe(false);
  });

  it('offers the guest-limit dialog when the undo would take a guest past the note limit', async () => {
    const failRestore = await undoTheDelete();

    failRestore(
      new ApiClientError(
        'Guest note limit reached',
        403,
        ANONYMOUS_NOTE_LIMIT_CODE
      )
    );

    expect(useAnonymousLimitStore.getState().showModal).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });
});
