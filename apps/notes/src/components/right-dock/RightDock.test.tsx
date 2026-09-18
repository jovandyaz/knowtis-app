import { useRightDockStore } from '@/stores/right-dock.store';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STUDY_FOCUS_ATTRIBUTE } from '../artifacts/focus/study-focus-marker';
import { reviewDockWidth, RightDock } from './RightDock';

interface TestProposal {
  kind: 'create' | 'update' | 'share';
  targetNoteId: string | null;
}

const agentState = vi.hoisted(() => ({
  newConversation: vi.fn(),
  messages: [{ id: 'm1', role: 'user', content: 'hi' }],
  pendingProposal: null as {
    kind: 'create' | 'update' | 'share';
    targetNoteId: string | null;
  } | null,
  status: 'idle' as 'idle' | 'streaming',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
const viewport = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('@knowtis/shared-hooks', () => ({
  useMediaQuery: () => viewport.isDesktop,
}));
vi.mock('../copilot', () => ({
  AgentCopilotPanel: () => <div>copilot-panel</div>,
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (selector: (state: typeof agentState) => unknown) =>
    selector(agentState),
  isUpdateProposal: (p: TestProposal) =>
    p.kind === 'update' && p.targetNoteId !== null,
}));

describe('RightDock', () => {
  beforeEach(() => {
    viewport.isDesktop = true;
    agentState.pendingProposal = null;
    agentState.status = 'idle';
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

  it('gives the dock header the shared panel chrome', () => {
    render(<RightDock />);
    const title = screen.getByText('ai.copilot.title');

    expect(title).toHaveClass('text-sm', 'font-medium', 'text-foreground');
    expect(title).not.toHaveClass('px-1');
    expect(title.parentElement).toHaveClass(
      'h-12',
      'shrink-0',
      'border-b',
      'border-border',
      'px-4'
    );
  });

  it('sizes the new-conversation action like the other panel icon buttons', () => {
    render(<RightDock />);
    const action = screen.getByRole('button', {
      name: /ai.copilot.newConversation/,
    });

    expect(action).toHaveClass('h-8', 'w-8');
    expect(action.querySelector('svg')).toHaveClass('h-4', 'w-4');
  });

  it('returns focus to the dock toggle when the collapsing panel holds it', async () => {
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <RightDock />
      </>
    );
    const separator = screen.getByRole('separator');
    separator.focus();

    fireEvent.keyDown(separator, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'toggle' })).toHaveFocus()
    );
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('leaves focus alone when the collapsing panel does not hold it', async () => {
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <button type="button">Outside</button>
        <RightDock />
      </>
    );
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Enter' });

    await waitFor(() =>
      expect(useRightDockStore.getState().isOpen).toBe(false)
    );
    expect(outside).toHaveFocus();
  });

  it('collapses on a host that offers no dock toggle', async () => {
    render(
      <>
        <button type="button">Outside</button>
        <RightDock />
      </>
    );
    const separator = screen.getByRole('separator');
    separator.focus();

    fireEvent.keyDown(separator, { key: 'Enter' });

    await waitFor(() =>
      expect(useRightDockStore.getState().isOpen).toBe(false)
    );
    expect(screen.getByRole('button', { name: 'Outside' })).not.toHaveFocus();
  });

  it('leaves the panel divider to the resize handle', () => {
    render(<RightDock />);
    const aside = screen.getByText('copilot-panel').closest('aside');

    expect(aside).toHaveClass('bg-background');
    expect(aside).not.toHaveClass('border-l');
  });

  it('computes the review width inside its bounds', () => {
    expect(reviewDockWidth(768)).toBe(500);
    expect(reviewDockWidth(1000)).toBe(600);
    expect(reviewDockWidth(1280)).toBe(768);
    expect(reviewDockWidth(1400)).toBe(840);
    expect(reviewDockWidth(2000)).toBe(960);
  });

  it('animates to the review width while an update proposal is under review and restores after', async () => {
    window.innerWidth = 1400;
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
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

  it('keeps the standard width for an update proposal with no target note', () => {
    agentState.pendingProposal = { kind: 'update', targetNoteId: null };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '500'
    );
  });

  it('holds the mobile dock open when Escape discards the proposal', () => {
    viewport.isDesktop = false;
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);
    fireEvent.keyDown(screen.getByText('copilot-panel'), { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('still closes the mobile dock on Escape outside a review', () => {
    viewport.isDesktop = false;
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });

    render(<RightDock />);
    fireEvent.keyDown(screen.getByText('copilot-panel'), { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('holds the mobile dock open when Escape fires while a turn is streaming', () => {
    viewport.isDesktop = false;
    agentState.status = 'streaming';
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });

    render(<RightDock />);
    fireEvent.keyDown(screen.getByText('copilot-panel'), { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('closes the mobile dock on Escape while idle', () => {
    viewport.isDesktop = false;
    agentState.status = 'idle';
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });

    render(<RightDock />);
    fireEvent.keyDown(screen.getByText('copilot-panel'), { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('closes the dock on a mobile resize during study without taking focus', async () => {
    const content = () => (
      <>
        <div {...{ [STUDY_FOCUS_ATTRIBUTE]: '' }}>
          <button type="button">Study card</button>
        </div>
        <RightDock />
      </>
    );
    const view = render(content());
    const card = screen.getByRole('button', { name: 'Study card' });
    card.focus();

    viewport.isDesktop = false;
    view.rerender(content());

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(useRightDockStore.getState().isOpen).toBe(false);
    expect(card).toHaveFocus();

    view.rerender(<RightDock />);
    act(() => useRightDockStore.getState().open());
    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
  });

  it('tracks viewport resizes only while an update proposal is under review', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const resizeCalls = () =>
      addEventListener.mock.calls.filter(([type]) => type === 'resize');

    const { unmount } = render(<RightDock />);
    expect(resizeCalls()).toHaveLength(0);
    unmount();

    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });
    render(<RightDock />);

    expect(resizeCalls()).toHaveLength(1);
    addEventListener.mockRestore();
  });

  it('keeps the standard width when the pending proposal is not an update', () => {
    agentState.pendingProposal = { kind: 'create', targetNoteId: null };
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
