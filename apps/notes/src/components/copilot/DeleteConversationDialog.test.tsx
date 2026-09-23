import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { captureProductEvent } from '@/lib/analytics/product-events';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError, conversationsApi } from '@knowtis/api-client';

import { DeleteConversationDialog } from './DeleteConversationDialog';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  conversationsApi: { remove: vi.fn() },
}));
vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function ClosableDialog() {
  const [open, setOpen] = useState(true);
  return open ? (
    <DeleteConversationDialog
      conversationId="c1"
      title="Trip"
      open
      onOpenChange={setOpen}
      onCloseAutoFocus={() => undefined}
    />
  ) : null;
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ClosableDialog />
    </QueryClientProvider>
  );
}

async function deleteThenClose(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog');
  await user.click(
    within(dialog).getByRole('button', { name: 'buttons.delete' })
  );
  await user.click(
    within(dialog).getByRole('button', { name: 'buttons.cancel' })
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('DeleteConversationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms a delete that finishes after the dialog was closed', async () => {
    const pending = deferred();
    vi.mocked(conversationsApi.remove).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderDialog();

    await deleteThenClose(user);
    pending.resolve();

    await waitFor(() =>
      expect(vi.mocked(toast.success).mock.calls).toEqual([
        ['ai.copilot.history.deleted'],
      ])
    );
    expect(vi.mocked(captureProductEvent).mock.calls).toEqual([
      ['ai conversation deleted', { source: 'switcher' }],
    ]);
  });

  it('reports a delete that fails after the dialog was closed', async () => {
    const pending = deferred();
    vi.mocked(conversationsApi.remove).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderDialog();

    await deleteThenClose(user);
    pending.reject(new ApiClientError('Conversation not found', 404));

    await waitFor(() =>
      expect(vi.mocked(toast.error).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ])
    );
    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('closes itself once the delete lands', async () => {
    vi.mocked(conversationsApi.remove).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'buttons.delete',
      })
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(vi.mocked(toast.success).mock.calls).toEqual([
      ['ai.copilot.history.deleted'],
    ]);
  });
});
