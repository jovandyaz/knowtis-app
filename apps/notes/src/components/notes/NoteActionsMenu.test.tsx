import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteActionsMenu } from './NoteActionsMenu';

const deleteMutate = vi.fn();
const restoreMutate = vi.fn();
const navigate = vi.fn();
const toastFn = vi.fn();
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
  toast: (...a: unknown[]) => toastFn(...a),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { title?: string }) => {
      const dictionary: Record<string, string> = {
        'delete.button': 'Delete',
        'delete.deleted': 'Note deleted',
        'delete.undo': 'Undo',
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
    expect(restoreMutate).toHaveBeenCalledWith('n1');
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
});
