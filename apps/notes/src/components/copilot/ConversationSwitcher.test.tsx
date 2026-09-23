import { useAgentStore } from '@/stores/agent.store';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@knowtis/design-system';
import type { ConversationPage } from '@knowtis/shared-types';

import { ConversationSwitcher } from './ConversationSwitcher';

const hooks = vi.hoisted(() => ({
  page: undefined as ConversationPage | undefined,
  listFailed: false,
  rename: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@knowtis/data-access-agent', () => ({
  useConversations: () => ({ data: hooks.page, isError: hooks.listFailed }),
  useRenameConversation: (callbacks: unknown) => ({
    mutate: (input: unknown) => hooks.rename(input, callbacks),
    isPending: false,
  }),
  useDeleteConversation: (callbacks: unknown) => ({
    mutate: (id: string, options: unknown) =>
      hooks.remove(id, options, callbacks),
    isPending: false,
  }),
  isConversationGone: (error: unknown) =>
    (error as { status?: number } | null)?.status === 404,
  invalidateConversations: vi.fn(),
}));
vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
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
    hooks.listFailed = false;
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

  it('says so when the list fails to load', async () => {
    hooks.listFailed = true;
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');

    expect(
      screen.getByRole('menuitem', { name: 'ai.copilot.history.listFailed' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('menuitem', { name: 'ai.copilot.history.empty' })
    ).toBeNull();
  });

  it('keeps the listed conversations when a refresh fails', async () => {
    hooks.page = pageOf(TRIP);
    hooks.listFailed = true;
    const user = userEvent.setup();
    render(<ConversationSwitcher />);

    await openMenu(user, 'ai.copilot.history.recent');

    expect(
      screen.getByRole('menuitemradio', {
        name: 'ai.copilot.history.openLabel:Trip',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'ai.copilot.history.listFailed' })
    ).toBeNull();
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

  describe('the active thread', () => {
    const newConversation = vi.fn();

    beforeEach(() => {
      useAgentStore.setState({
        conversationId: 'c1',
        conversationTitle: 'Trip',
        newConversation,
      });
    });

    const pick = async (
      user: ReturnType<typeof userEvent.setup>,
      name: string
    ) => {
      await openMenu(user, 'Trip');
      await user.click(screen.getByRole('menuitem', { name }));
    };

    const renameField = () =>
      screen.getByRole('textbox', { name: 'ai.copilot.history.renameLabel' });

    it('renames it with the normalized title', async () => {
      hooks.rename.mockImplementation(
        (
          input: unknown,
          callbacks?: { onSuccess?: (data: undefined, input: unknown) => void }
        ) => callbacks?.onSuccess?.(undefined, input)
      );
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      const field = renameField();
      expect(field).toHaveValue('Trip');
      expect(field).toHaveFocus();
      await user.clear(field);
      await user.type(field, '  Trip   to Oaxaca {Enter}');

      expect(hooks.rename).toHaveBeenCalledWith(
        { id: 'c1', title: 'Trip to Oaxaca' },
        expect.any(Object)
      );
      expect(useAgentStore.getState().conversationTitle).toBe('Trip to Oaxaca');
      expect(
        screen.getByRole('button', { name: 'Trip to Oaxaca' })
      ).toHaveFocus();
    });

    it('sends nothing when the title did not change', async () => {
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      await user.type(renameField(), '{Enter}');

      expect(hooks.rename).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Trip' })).toHaveFocus();
    });

    it('refuses a blank title', async () => {
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      const field = renameField();
      await user.clear(field);
      await user.type(field, '   {Enter}');

      expect(hooks.rename).not.toHaveBeenCalled();
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });

    it('says so when the thread is gone before the rename lands', async () => {
      hooks.rename.mockImplementation(
        (_input: unknown, callbacks?: { onError?: (error: unknown) => void }) =>
          callbacks?.onError?.({ status: 404 })
      );
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      await user.type(renameField(), ' again{Enter}');

      expect(vi.mocked(toast.error).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ]);
      expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();
    });

    it('cancels a rename on Escape and hands focus back to the trigger', async () => {
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      await user.keyboard('{Escape}');

      expect(hooks.rename).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Trip' })).toHaveFocus();
    });

    it('keeps the dialog around it open when Escape cancels a rename', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent closeLabel="close">
            <DialogTitle>dock</DialogTitle>
            <ConversationSwitcher />
          </DialogContent>
        </Dialog>
      );

      await pick(user, 'ai.copilot.history.rename');
      await user.keyboard('{Escape}');

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Trip' })).toHaveFocus();
    });

    it('cancels without taking focus back when the field loses it', async () => {
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.rename');
      act(() => renameField().blur());

      expect(hooks.rename).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Trip' })).not.toHaveFocus();
    });

    it('clears the dock before deleting the thread', async () => {
      hooks.remove.mockImplementation(
        (
          _id: unknown,
          options?: { onSettled?: () => void },
          callbacks?: { onSuccess?: () => void }
        ) => {
          callbacks?.onSuccess?.();
          options?.onSettled?.();
        }
      );
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.delete');
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(
        'ai.copilot.history.deleteConfirmBody:Trip'
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'buttons.delete' })
      );

      expect(hooks.remove).toHaveBeenCalledWith(
        'c1',
        expect.any(Object),
        expect.any(Object)
      );
      expect(newConversation.mock.invocationCallOrder[0]).toBeLessThan(
        hooks.remove.mock.invocationCallOrder[0]
      );
      expect(vi.mocked(toast.success).mock.calls).toEqual([
        ['ai.copilot.history.deleted'],
      ]);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('returns focus to the trigger when the delete is cancelled', async () => {
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.delete');
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'buttons.cancel',
        })
      );

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Trip' })).toHaveFocus()
      );
      expect(hooks.remove).not.toHaveBeenCalled();
      expect(newConversation).not.toHaveBeenCalled();
    });

    it('says so when the thread was already gone', async () => {
      hooks.remove.mockImplementation(
        (
          _id: unknown,
          options?: { onSettled?: () => void },
          callbacks?: { onError?: (error: unknown) => void }
        ) => {
          callbacks?.onError?.({ status: 404 });
          options?.onSettled?.();
        }
      );
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await pick(user, 'ai.copilot.history.delete');
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'buttons.delete',
        })
      );

      expect(vi.mocked(toast.error).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ]);
    });

    it('renders a hostile title as text in the confirmation', async () => {
      useAgentStore.setState({ conversationTitle: HOSTILE });
      const user = userEvent.setup();
      render(<ConversationSwitcher />);

      await openMenu(user, HOSTILE);
      await user.click(
        screen.getByRole('menuitem', { name: 'ai.copilot.history.delete' })
      );

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        `ai.copilot.history.deleteConfirmBody:${HOSTILE}`
      );
      expect(document.querySelector('img')).toBeNull();
    });
  });
});
