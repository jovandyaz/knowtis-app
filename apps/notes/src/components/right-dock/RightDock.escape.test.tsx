import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { pressEscape } from '@/test/escape';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Response } from '../ai-elements/message';
import { RightDock } from './RightDock';

const REPLY = '[go](https://example.com/page)';
const DOCK_NAME = 'ai.copilot.tab';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../copilot/AgentCopilotPanel', () => ({
  AgentCopilotPanel: () => <Response>{REPLY}</Response>,
}));
vi.mock('../copilot/ConversationSwitcher', () => ({
  ConversationSwitcher: () => null,
}));
vi.mock('../copilot/TierBadge', () => ({ TierBadge: () => null }));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) =>
    selector({
      newConversation: vi.fn(),
      messages: [],
      pendingProposal: null,
      status: 'idle',
      conversationId: null,
    }),
  isUpdateProposal: () => false,
}));

describe('RightDock dialog with a chat link dialog open', () => {
  beforeEach(() => {
    window.innerWidth = 1024;
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });
    useSidebarStore.setState({ visibleWidth: 272 });
  });

  it('closes only the link dialog on the first Escape and the dock on the second', async () => {
    render(<RightDock />);
    await screen.findByRole('dialog', { name: DOCK_NAME });
    await userEvent.click(await screen.findByRole('button', { name: 'go' }));
    await screen.findByRole('dialog', { name: 'notes:ai.linkConfirm.title' });

    pressEscape();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'notes:ai.linkConfirm.title' })
      ).toBeNull()
    );
    expect(screen.getByRole('dialog', { name: DOCK_NAME })).toBeVisible();
    expect(useRightDockStore.getState().isOpen).toBe(true);

    pressEscape();

    await waitFor(() =>
      expect(useRightDockStore.getState().isOpen).toBe(false)
    );
  });

  it('keeps the dock open when the Escape cancels an IME composition', async () => {
    render(<RightDock />);
    await screen.findByRole('dialog', { name: DOCK_NAME });

    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });

    expect(screen.getByRole('dialog', { name: DOCK_NAME })).toBeVisible();
    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('closes the dock on Escape when no link dialog is open', async () => {
    render(<RightDock />);
    await screen.findByRole('dialog', { name: DOCK_NAME });

    pressEscape();

    await waitFor(() =>
      expect(useRightDockStore.getState().isOpen).toBe(false)
    );
  });
});
