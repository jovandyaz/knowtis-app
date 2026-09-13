import { useRightDockStore } from '@/stores/right-dock.store';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reviewDockWidth, RightDock } from './RightDock';

const agentState = vi.hoisted(() => ({
  newConversation: vi.fn(),
  messages: [{ id: 'm1', role: 'user', content: 'hi' }],
  pendingProposal: null as { kind: 'create' | 'update' | 'share' } | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/shared-hooks', () => ({ useMediaQuery: () => true }));
vi.mock('../copilot', () => ({
  AgentCopilotPanel: () => <div>copilot-panel</div>,
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (selector: (state: typeof agentState) => unknown) =>
    selector(agentState),
}));

describe('RightDock', () => {
  beforeEach(() => {
    agentState.pendingProposal = null;
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });
  });

  it('renders only the copilot panel', () => {
    render(<RightDock />);
    expect(screen.getByText('copilot-panel')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders the new-conversation action', () => {
    render(<RightDock />);
    expect(
      screen.getByRole('button', { name: /ai.copilot.newConversation/ })
    ).toBeInTheDocument();
  });

  it('computes the review width inside its bounds', () => {
    expect(reviewDockWidth(1000)).toBe(640);
    expect(reviewDockWidth(1400)).toBe(840);
    expect(reviewDockWidth(2000)).toBe(960);
  });

  it('animates to the review width while an update proposal is under review and restores after', async () => {
    window.innerWidth = 1400;
    agentState.pendingProposal = { kind: 'update' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);
    const aside = screen
      .getByText('copilot-panel')
      .closest('aside') as HTMLElement;

    await waitFor(() => expect(aside.style.width).toBe('840px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '840'
    );

    act(() => useRightDockStore.getState().closeReview());
    await waitFor(() => expect(aside.style.width).toBe('500px'));
  });

  it('keeps the standard width when the pending proposal is not an update', () => {
    agentState.pendingProposal = { kind: 'create' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);
    const aside = screen
      .getByText('copilot-panel')
      .closest('aside') as HTMLElement;

    expect(aside.style.width).toBe('500px');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '500'
    );
  });
});
