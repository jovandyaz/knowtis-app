import { useAgentStore } from '@/stores/agent.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationPage } from '@knowtis/shared-types';

import { ConversationSwitcher } from './ConversationSwitcher';

const hooks = vi.hoisted(() => ({
  page: undefined as ConversationPage | undefined,
  rename: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@knowtis/data-access-agent', () => ({
  useConversations: () => ({ data: hooks.page }),
  useRenameConversation: () => ({ mutate: hooks.rename, isPending: false }),
  useDeleteConversation: () => ({ mutate: hooks.remove, isPending: false }),
  isConversationGone: (error: unknown) =>
    (error as { status?: number } | null)?.status === 404,
  invalidateConversations: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) =>
      options?.title === undefined ? key : `${key}:${options.title}`,
    i18n: { language: 'en' },
  }),
}));

const HOSTILE = '<img src=x onerror=alert(1)>';

function pageOf(...items: ConversationPage['items']): ConversationPage {
  return { items, total: items.length, page: 1, limit: 25 };
}

const TRIP = {
  id: 'c2',
  title: 'Trip',
  noteId: 'n1',
  noteTitle: 'Viaje',
  updatedAt: new Date().toISOString(),
};

const openMenu = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string
) => user.click(screen.getByRole('button', { name }));

describe('ConversationSwitcher', () => {
  const open = vi.fn(async () => 'opened' as const);

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.page = undefined;
    useAgentStore.setState({
      conversationId: null,
      conversationTitle: null,
      openConversation: open,
    });
  });

  it('names the trigger after the active thread', () => {
    useAgentStore.setState({ conversationId: 'c1', conversationTitle: 'Trip' });

    render(<ConversationSwitcher />);

    expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();
  });

  it('names an active thread without a title as untitled', () => {
    useAgentStore.setState({ conversationId: 'c1' });

    render(<ConversationSwitcher />);

    expect(
      screen.getByRole('button', { name: 'ai.copilot.history.untitled' })
    ).toBeInTheDocument();
  });

  it('names a thread that is still loading after its listed title', () => {
    useAgentStore.setState({ conversationId: 'c2' });
    hooks.page = pageOf(TRIP);

    render(<ConversationSwitcher />);

    expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();
  });

  it('offers the recent conversations when no thread is active', () => {
    render(<ConversationSwitcher />);

    expect(
      screen.getByRole('button', { name: 'ai.copilot.history.recent' })
    ).toBeInTheDocument();
  });

  it('lists each conversation with its note', async () => {
    hooks.page = pageOf(TRIP);
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');

    const item = screen.getByRole('menuitemradio', {
      name: 'ai.copilot.history.openLabel:Trip',
    });
    expect(item).toHaveTextContent('Trip');
    expect(item).toHaveTextContent('Viaje');
  });

  it('checks the active thread in the list', async () => {
    useAgentStore.setState({ conversationId: 'c2', conversationTitle: 'Trip' });
    hooks.page = pageOf(TRIP, {
      ...TRIP,
      id: 'c3',
      title: 'Budget',
      noteTitle: null,
    });
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'Trip');

    expect(
      screen
        .getAllByRole('menuitemradio')
        .map((item) => item.getAttribute('aria-checked'))
    ).toEqual(['true', 'false']);
  });

  it('opens the conversation the user picks', async () => {
    hooks.page = pageOf(TRIP);
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');
    await user.click(
      screen.getByRole('menuitemradio', {
        name: 'ai.copilot.history.openLabel:Trip',
      })
    );

    expect(open.mock.calls).toEqual([['c2', 'switcher']]);
  });

  it('says so when the picked conversation is gone', async () => {
    hooks.page = pageOf(TRIP);
    useAgentStore.setState({
      openConversation: vi.fn(async () => 'gone' as const),
    });
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');
    await user.click(
      screen.getByRole('menuitemradio', {
        name: 'ai.copilot.history.openLabel:Trip',
      })
    );

    await waitFor(() =>
      expect(vi.mocked(toast.info).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ])
    );
  });

  it('names an empty history', async () => {
    hooks.page = pageOf();
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');

    expect(
      screen.getByRole('menuitem', { name: 'ai.copilot.history.empty' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('claims no empty history before the list has loaded', async () => {
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByText('ai.copilot.history.empty')).toBeNull();
  });

  it('renders a hostile title as text in the trigger and the list', async () => {
    useAgentStore.setState({
      conversationId: 'c1',
      conversationTitle: HOSTILE,
    });
    hooks.page = pageOf({ ...TRIP, id: 'c1', title: HOSTILE });
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, HOSTILE);

    expect(
      screen.getByRole('menuitemradio', {
        name: `ai.copilot.history.openLabel:${HOSTILE}`,
      })
    ).toHaveTextContent(HOSTILE);
    expect(document.querySelector('img')).toBeNull();
  });
});
