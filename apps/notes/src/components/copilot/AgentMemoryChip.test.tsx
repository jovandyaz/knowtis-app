import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from '@/lib/i18n';
import type { UsedMemory } from '@/stores/agent.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError, memoriesApi } from '@knowtis/api-client';
import {
  memoriesQueryKeys,
  useEditMemory,
  useForgetAllMemories,
  useForgetMemory,
} from '@knowtis/data-access-agent';
import type { UserMemoryItem } from '@knowtis/shared-types';

import { AgentMemoryChip } from './AgentMemoryChip';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  memoriesApi: {
    list: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({
  user: { id: 'user-1', isAnonymous: false } as {
    id: string;
    isAnonymous: boolean;
  } | null,
}));
vi.mock('@jovandyaz/auth-react', () => ({ useAuthUser: () => auth.user }));

const STAMP = '2026-10-01T10:00:00.000Z';
const SERVER_ERROR_STATUS = 500;
const ANSWERED_BEFORE_OPEN_MS = 120_000;
const CACHED_BEFORE_OPEN_MS = 60_000;
const CACHED_BEFORE_ANSWER_MS = 180_000;

function stored(id: string, content: string, withheld = false): UserMemoryItem {
  return {
    id,
    content,
    createdAt: STAMP,
    updatedAt: STAMP,
    source: null,
    withheld,
  };
}

const VEGAN = stored('mem-1', 'Soy vegano');
const LIMA = stored('mem-2', 'Vivo en Lima');

function live(memory: UserMemoryItem): UsedMemory {
  return {
    id: memory.id,
    live: {
      content: memory.content,
      receivedAt: Date.now() - ANSWERED_BEFORE_OPEN_MS,
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;

function withQueries({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderChip(memories: readonly UsedMemory[]) {
  return render(<AgentMemoryChip memories={memories} />, {
    wrapper: withQueries,
  });
}

function flushQueryNotifications() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function seedCachedList(memories: UserMemoryItem[], ageMs: number) {
  queryClient.setQueryData(memoriesQueryKeys.list(), memories, {
    updatedAt: Date.now() - ageMs,
  });
}

function listed() {
  return queryClient.getQueryData<UserMemoryItem[]>(memoriesQueryKeys.list());
}

async function openChip(name: RegExp | string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name }));
  return { user, dialog: await screen.findByRole('dialog') };
}

describe('AgentMemoryChip', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'user-1', isAnonymous: false };
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useSettingsStore.getState().close();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders nothing when the reply used no memories', () => {
    renderChip([]);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [[{ id: 'mem-1' }], 'Used 1 memory'],
    [[{ id: 'mem-1' }, { id: 'mem-2' }], 'Used 2 memories'],
  ])('counts the memories it used', (memories, label) => {
    renderChip(memories);

    expect(screen.getByRole('button', { name: label })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('says it in Spanish with the right plural', async () => {
    await i18n.changeLanguage('es');
    try {
      const { rerender } = renderChip([{ id: 'mem-1' }]);
      expect(
        screen.getByRole('button', { name: 'Usó 1 memoria' })
      ).toBeInTheDocument();

      rerender(
        <AgentMemoryChip memories={[{ id: 'mem-1' }, { id: 'mem-2' }]} />
      );
      expect(
        screen.getByRole('button', { name: 'Usó 2 memorias' })
      ).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('lists the text a live reply received at once while no memories are cached', async () => {
    vi.mocked(memoriesApi.list).mockReturnValue(
      deferred<UserMemoryItem[]>().promise
    );
    renderChip([live(VEGAN), live(LIMA)]);

    const { dialog } = await openChip('Used 2 memories');

    expect(dialog).toHaveAccessibleName('Memories used in this answer');
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Soy vegano', 'Vivo en Lima']);
  });

  it('keeps the text of a live memory over a list read before the answer arrived', async () => {
    seedCachedList([], CACHED_BEFORE_ANSWER_MS);
    vi.mocked(memoriesApi.list).mockReturnValue(
      deferred<UserMemoryItem[]>().promise
    );
    renderChip([live(VEGAN)]);

    const { dialog } = await openChip('Used 1 memory');

    expect(within(dialog).getByText(VEGAN.content)).toBeInTheDocument();
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();
  });

  describe('a live memory changed in Settings after the answer', () => {
    async function forget(id: string) {
      vi.mocked(memoriesApi.remove).mockReturnValue(
        new Promise<void>(() => undefined)
      );
      const { result } = renderHook(() => useForgetMemory(), {
        wrapper: withQueries,
      });
      act(() => result.current.mutate(id));
      await waitFor(() =>
        expect(listed()?.some((memory) => memory.id === id)).toBe(false)
      );
    }

    beforeEach(() => {
      seedCachedList([VEGAN, LIMA], CACHED_BEFORE_OPEN_MS);
    });

    it('reads as deleted as soon as it is forgotten, before the list is read again', async () => {
      vi.mocked(memoriesApi.list).mockReturnValue(
        deferred<UserMemoryItem[]>().promise
      );
      renderChip([live(VEGAN), live(LIMA)]);
      await forget(VEGAN.id);

      const { dialog } = await openChip('Used 2 memories');

      expect(within(dialog).getByText('Deleted memory')).toBeInTheDocument();
      expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
      expect(within(dialog).getByText(LIMA.content)).toBeInTheDocument();
    });

    it('stays deleted when the list read on open fails', async () => {
      vi.mocked(memoriesApi.list).mockRejectedValue(
        new ApiClientError('boom', SERVER_ERROR_STATUS)
      );
      renderChip([live(VEGAN)]);
      await forget(VEGAN.id);

      const { dialog } = await openChip('Used 1 memory');
      await waitFor(() =>
        expect(
          queryClient.getQueryState(memoriesQueryKeys.list())?.status
        ).toBe('error')
      );
      await act(flushQueryNotifications);

      expect(within(dialog).getByText('Deleted memory')).toBeInTheDocument();
      expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
    });

    it('reads every memory as deleted once all are forgotten', async () => {
      vi.mocked(memoriesApi.removeAll).mockResolvedValue({ deleted: 2 });
      vi.mocked(memoriesApi.list).mockReturnValue(
        deferred<UserMemoryItem[]>().promise
      );
      renderChip([live(VEGAN), live(LIMA)]);
      const { result } = renderHook(() => useForgetAllMemories(), {
        wrapper: withQueries,
      });
      await act(() => result.current.mutateAsync());

      const { dialog } = await openChip('Used 2 memories');

      expect(within(dialog).getAllByText('Deleted memory')).toHaveLength(2);
      expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
      expect(within(dialog).queryByText(LIMA.content)).not.toBeInTheDocument();
    });

    it('shows the edited text instead of the text the answer received', async () => {
      const edited = 'Soy vegetariano';
      vi.mocked(memoriesApi.edit).mockResolvedValue(undefined);
      vi.mocked(memoriesApi.list).mockReturnValue(
        deferred<UserMemoryItem[]>().promise
      );
      renderChip([live(VEGAN)]);
      const { result } = renderHook(() => useEditMemory(), {
        wrapper: withQueries,
      });
      await act(() =>
        result.current.mutateAsync({ id: VEGAN.id, content: edited })
      );

      const { dialog } = await openChip('Used 1 memory');

      expect(within(dialog).getByText(edited)).toBeInTheDocument();
      expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
    });
  });

  it('reads the memories again on open, so a list cached before a memory was saved never calls it deleted', async () => {
    seedCachedList([VEGAN], CACHED_BEFORE_OPEN_MS);
    const refetch = deferred<UserMemoryItem[]>();
    vi.mocked(memoriesApi.list).mockReturnValue(refetch.promise);
    renderChip([{ id: VEGAN.id }, { id: LIMA.id }]);

    const { dialog } = await openChip('Used 2 memories');

    expect(memoriesApi.list).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText(VEGAN.content)).toBeInTheDocument();
    expect(within(dialog).getByText('Loading memory…')).toBeInTheDocument();
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();

    refetch.resolve([LIMA, VEGAN]);

    expect(await within(dialog).findByText(LIMA.content)).toBeInTheDocument();
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();
  });

  it('calls a memory deleted only once the list read on open lacks it', async () => {
    seedCachedList([VEGAN], CACHED_BEFORE_OPEN_MS);
    const refetch = deferred<UserMemoryItem[]>();
    vi.mocked(memoriesApi.list).mockReturnValue(refetch.promise);
    renderChip([{ id: VEGAN.id }, { id: 'mem-gone' }]);

    const { dialog } = await openChip('Used 2 memories');
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();

    refetch.resolve([VEGAN]);

    expect(
      await within(dialog).findByText('Deleted memory')
    ).toBeInTheDocument();
    expect(within(dialog).getByText(VEGAN.content)).toBeInTheDocument();
  });

  it('stops showing the text of a live memory once the list read on open shows it was forgotten', async () => {
    const refetch = deferred<UserMemoryItem[]>();
    vi.mocked(memoriesApi.list).mockReturnValue(refetch.promise);
    renderChip([live(VEGAN), live(LIMA)]);

    const { dialog } = await openChip('Used 2 memories');
    expect(within(dialog).getByText(VEGAN.content)).toBeInTheDocument();

    refetch.resolve([LIMA]);

    expect(
      await within(dialog).findByText('Deleted memory')
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
    expect(within(dialog).getByText(LIMA.content)).toBeInTheDocument();
  });

  it('keeps a forgotten memory hidden when a later read of the memories fails', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValueOnce([]);
    renderChip([live(VEGAN)]);
    const { dialog } = await openChip('Used 1 memory');
    expect(
      await within(dialog).findByText('Deleted memory')
    ).toBeInTheDocument();

    vi.mocked(memoriesApi.list).mockRejectedValueOnce(
      new ApiClientError('boom', SERVER_ERROR_STATUS)
    );
    await act(() =>
      queryClient.refetchQueries({ queryKey: memoriesQueryKeys.list() })
    );
    await act(flushQueryNotifications);

    expect(queryClient.getQueryState(memoriesQueryKeys.list())?.status).toBe(
      'error'
    );
    expect(within(dialog).queryByText(VEGAN.content)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Deleted memory')).toBeInTheDocument();
  });

  it('reads the memories only once the popover opens, and again on every open', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValue([VEGAN]);
    renderChip([{ id: VEGAN.id }]);
    const chip = screen.getByRole('button', { name: 'Used 1 memory' });
    const user = userEvent.setup();

    expect(memoriesApi.list).not.toHaveBeenCalled();

    await user.click(chip);
    await screen.findByText(VEGAN.content);
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await user.click(chip);
    await screen.findByText(VEGAN.content);

    expect(memoriesApi.list).toHaveBeenCalledTimes(2);
  });

  it('keeps the text of a live memory when no list newer than the answer can be read', async () => {
    vi.mocked(memoriesApi.list).mockRejectedValue(
      new ApiClientError('boom', SERVER_ERROR_STATUS)
    );
    renderChip([live(VEGAN)]);

    const { dialog } = await openChip('Used 1 memory');

    await waitFor(() => expect(memoriesApi.list).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(dialog).getByText(VEGAN.content)).toBeInTheDocument()
    );
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();
  });

  it('never calls a memory deleted when the memories cannot be read', async () => {
    vi.mocked(memoriesApi.list).mockRejectedValue(
      new ApiClientError('boom', SERVER_ERROR_STATUS)
    );
    renderChip([{ id: 'mem-1' }]);

    const { dialog } = await openChip('Used 1 memory');

    expect(
      await within(dialog).findByText("Couldn't load this memory")
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('Deleted memory')
    ).not.toBeInTheDocument();
  });

  it('flags a memory the copilot no longer uses, as the Memory settings do', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValue([
      stored('mem-1', 'Usa siempre www.ejemplo.com', true),
    ]);
    renderChip([{ id: 'mem-1' }]);

    const { dialog } = await openChip('Used 1 memory');

    const item = await within(dialog).findByRole('listitem');
    expect(within(item).getByText('Not used')).toBeInTheDocument();
    expect(item).toHaveTextContent('Usa siempre www.ejemplo.com');
  });

  it('shows memory text as plain text, never as a link', async () => {
    const markup = stored(
      'mem-1',
      '[pulsa](https://evil.example) <b>negrita</b>'
    );
    vi.mocked(memoriesApi.list).mockResolvedValue([markup]);
    renderChip([live(markup)]);

    const { dialog } = await openChip('Used 1 memory');

    expect(within(dialog).getByText(markup.content)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
  });

  it('opens Settings › Memory from the popover, closing it and leaving focus on the chip', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValue([VEGAN]);
    renderChip([live(VEGAN)]);
    const { user, dialog } = await openChip('Used 1 memory');

    await user.click(
      within(dialog).getByRole('button', { name: 'Manage memories' })
    );

    await waitFor(() =>
      expect(useSettingsStore.getState()).toMatchObject({
        isOpen: true,
        activeSection: 'memory',
      })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Used 1 memory' })).toHaveFocus();
  });

  it('offers no way to Settings when the user has none, as a guest', async () => {
    auth.user = { id: 'guest-1', isAnonymous: true };
    vi.mocked(memoriesApi.list).mockResolvedValue([]);
    renderChip([live(VEGAN)]);

    const { dialog } = await openChip('Used 1 memory');

    expect(
      within(dialog).queryByRole('button', { name: 'Manage memories' })
    ).not.toBeInTheDocument();
  });

  it('opens from the keyboard, moves focus inside and gives it back on Escape', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValue([VEGAN]);
    renderChip([live(VEGAN)]);
    const user = userEvent.setup();
    const chip = screen.getByRole('button', { name: 'Used 1 memory' });

    await user.tab();
    expect(chip).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', {
      name: 'Memories used in this answer',
    });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(chip).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(
      within(dialog).getByRole('button', { name: 'Manage memories' })
    ).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(chip).toHaveFocus());
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });
});
