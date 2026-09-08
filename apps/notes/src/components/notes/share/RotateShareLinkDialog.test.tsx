import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteDetail } from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import { useShareActionLock } from '../../../hooks/useShareActionLock';
import { RotateShareLinkDialog } from './RotateShareLinkDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const note: NoteDetail = {
  id: 'note',
  ownerId: 'owner',
  title: 'Note',
  content: '<p>Content</p>',
  shareToken: 'old',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  editorsCanShare: true,
  bucket: null,
  supertag: null,
  supertagFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  owner: { id: 'owner', name: 'Owner', avatarUrl: null },
  accessLevel: 'owner',
};
function Harness({
  isOwner = true,
  token = 'old',
  disabled = false,
}: {
  isOwner?: boolean;
  token?: string | null;
  disabled?: boolean;
}) {
  const actionLock = useShareActionLock();
  return (
    <RotateShareLinkDialog
      note={{ ...note, shareToken: token }}
      isOwner={isOwner}
      disabled={disabled}
      actionLock={actionLock}
    />
  );
}
describe('RotateShareLinkDialog', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: 3, retryDelay: 0 },
      },
    });
    client.setQueryData(notesQueryKeys.detail('note'), note);
  });
  afterEach(() => {
    cleanup();
    client.clear();
    vi.unstubAllGlobals();
  });
  it('shows the owner action while paused; cancel returns focus without a request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<Harness />, { wrapper });
    const trigger = screen.getByRole('button', {
      name: 'sharing.rotation.action',
    });
    await user.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'sharing.rotation.title' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('sharing.rotation.description')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'sharing.rotation.cancel' })
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ isOwner: false }, { token: null }])(
    'hides rotation without owner authorization or token (%j)',
    (props) => {
      render(<Harness {...props} />, { wrapper });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );
  it('does not open while authorization is refreshing', () => {
    render(<Harness disabled />, { wrapper });
    expect(
      screen.getByRole('button', { name: 'sharing.rotation.action' })
    ).toBeDisabled();
  });
  it('accepts one native submit across same-tick repeated confirmation', async () => {
    const response = Promise.withResolvers<Response>();
    const fetcher = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<Harness />, { wrapper });
    await user.click(
      screen.getByRole('button', { name: 'sharing.rotation.action' })
    );
    const form = screen
      .getByRole('button', { name: 'sharing.rotation.confirm' })
      .closest('form');
    if (!form) {
      throw new Error('Expected native confirmation form');
    }
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: 'sharing.rotation.confirm' })
    ).toBeDisabled();
    await act(async () => {
      response.resolve(
        new Response(JSON.stringify({ ...note, shareToken: 'new' }), {
          status: 200,
        })
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('shows uncertain outcome and refetches without offering another confirmation in the same dialog', async () => {
    const methods: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        methods.push(init.method ?? 'GET');
        if (init.method === 'POST') {
          throw new TypeError('Response lost');
        }
        return new Response(JSON.stringify({ ...note, shareToken: 'new' }), {
          status: 200,
        });
      })
    );
    const user = userEvent.setup();
    render(<Harness />, { wrapper });
    await user.click(
      screen.getByRole('button', { name: 'sharing.rotation.action' })
    );
    await user.click(
      screen.getByRole('button', { name: 'sharing.rotation.confirm' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'sharing.rotation.uncertain'
    );
    expect(methods).toEqual(['POST', 'GET']);
    expect(
      screen.queryByRole('button', { name: 'sharing.rotation.confirm' })
    ).not.toBeInTheDocument();
  });
});
