import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAgentStore } from '@/stores/agent.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError, conversationsApi } from '@knowtis/api-client';

import { ConversationSwitcher } from './ConversationSwitcher';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  conversationsApi: {
    list: vi.fn(() => new Promise(() => undefined)),
    rename: vi.fn(),
  },
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
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

async function renameThenUnmount(title: string) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ConversationSwitcher />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole('button', { name: 'Trip' }));
  await user.click(
    screen.getByRole('menuitem', { name: 'ai.copilot.history.rename' })
  );
  const field = screen.getByRole('textbox', {
    name: 'ai.copilot.history.renameLabel',
  });
  await user.clear(field);
  await user.type(field, `${title}{Enter}`);
  unmount();
}

describe('ConversationSwitcher when it unmounts mid-rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ conversationId: 'c1', conversationTitle: 'Trip' });
  });

  it('still shows the new title once the rename lands', async () => {
    const pending = deferred();
    vi.mocked(conversationsApi.rename).mockReturnValue(pending.promise);

    await renameThenUnmount('Oaxaca');
    pending.resolve();

    await waitFor(() =>
      expect(useAgentStore.getState().conversationTitle).toBe('Oaxaca')
    );
  });

  it('still reports a rename that fails', async () => {
    const pending = deferred();
    vi.mocked(conversationsApi.rename).mockReturnValue(pending.promise);

    await renameThenUnmount('Oaxaca');
    pending.reject(new ApiClientError('Conversation not found', 404));

    await waitFor(() =>
      expect(vi.mocked(toast.error).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ])
    );
    expect(useAgentStore.getState().conversationTitle).toBe('Trip');
  });
});
