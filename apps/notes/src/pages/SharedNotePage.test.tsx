import type { ReactNode } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { SharedNotePage } from './SharedNotePage';

const ensureGuestSession = vi.fn<() => Promise<boolean>>();
const toastError = vi.fn();
let denyEdit: (() => void) | undefined;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ token: 'tok' }),
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/login">{children}</a>
  ),
}));
vi.mock('@/auth/setup', () => ({
  ensureGuestSession: () => ensureGuestSession(),
}));
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));
vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: ({ onEditDenied }: { onEditDenied?: () => void }) => {
    denyEdit = onEditDenied;
    return <div data-testid="collaborative-editor" />;
  },
}));
vi.mock('@knowtis/editor', () => ({
  ReadOnlyEditor: ({ content }: { content: string }) => (
    <div data-testid="read-only-editor">{content}</div>
  ),
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSharedNoteArtifacts: () => ({ data: [] }),
}));
vi.mock('@knowtis/data-access-notes', () => ({
  useNoteByToken: () => ({
    data: {
      id: 'note-1',
      title: 'Shared note',
      content: '<p>body</p>',
      owner: { name: 'Owner' },
      updatedAt: '2026-08-14T00:00:00.000Z',
      accessLevel: 'editor',
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const clickEdit = () =>
  userEvent.click(
    screen.getAllByRole('button', { name: 'shared.editButton' })[0]
  );

describe('SharedNotePage editing as a visitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    denyEdit = undefined;
  });

  it('gives an account-less visitor an identity before opening the editor', async () => {
    ensureGuestSession.mockResolvedValue(true);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();

    await waitFor(() =>
      expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument()
    );
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the note readable and says why when no session can be created', async () => {
    ensureGuestSession.mockResolvedValue(false);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('shared.editUnavailable')
    );
    expect(screen.getByTestId('read-only-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('collaborative-editor')).toBeNull();
  });

  it('drops back to reading — not to the login page — when the server denies the edit', async () => {
    ensureGuestSession.mockResolvedValue(true);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();
    await waitFor(() => expect(denyEdit).toBeDefined());
    act(() => denyEdit?.());

    await waitFor(() =>
      expect(screen.getByTestId('read-only-editor')).toBeInTheDocument()
    );
    expect(toastError).toHaveBeenCalledWith('shared.editDenied');
  });
});
