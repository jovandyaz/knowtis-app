import { useEffect } from 'react';

import { useDockPreferenceStore } from '@/stores/dock-preference.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SharedHooks from '@knowtis/shared-hooks';

import { STUDY_FOCUS_ATTRIBUTE } from '../artifacts/focus/study-focus-marker';
import { PANEL_ID, reviewDockWidth, RightDock } from './RightDock';

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
  draft: '',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
const viewport = vi.hoisted(() => ({ isDesktop: true }));
vi.mock('@knowtis/shared-hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedHooks>()),
  useMediaQuery: () => viewport.isDesktop,
}));
const copilotPanel = vi.hoisted(() => ({ effectRuns: 0 }));
const isUpdateProposal = vi.hoisted(
  () => (p: TestProposal) => p.kind === 'update' && p.targetNoteId !== null
);
vi.mock('../copilot', () => ({
  AgentCopilotPanel: () => {
    const openReview = useRightDockStore((s) => s.openReview);
    const closeReview = useRightDockStore((s) => s.closeReview);
    const proposal = agentState.pendingProposal;
    const updateProposalId =
      proposal && isUpdateProposal(proposal) ? proposal.targetNoteId : null;
    useEffect(() => {
      copilotPanel.effectRuns += 1;
      if (updateProposalId) {
        openReview();
      } else {
        closeReview();
      }
      return closeReview;
    }, [updateProposalId, openReview, closeReview]);
    return (
      <div>
        <span>copilot-panel</span>
        <span>{agentState.draft}</span>
      </div>
    );
  },
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (selector: (state: typeof agentState) => unknown) =>
    selector(agentState),
  isUpdateProposal,
}));

describe('RightDock', () => {
  beforeEach(() => {
    viewport.isDesktop = true;
    window.innerWidth = 1440;
    agentState.messages = [{ id: 'm1', role: 'user', content: 'hi' }];
    agentState.newConversation.mockClear();
    agentState.pendingProposal = null;
    agentState.status = 'idle';
    agentState.draft = '';
    copilotPanel.effectRuns = 0;
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });
    useSidebarStore.setState({ visibleWidth: 0 });
    useDockPreferenceStore.setState({ preferredWidth: 360 });
    localStorage.clear();
  });

  const dockAside = () =>
    screen.getByText('copilot-panel').closest('aside') as HTMLElement;

  const resetAction = () =>
    screen.getByRole('button', { name: /ai.copilot.newConversation/ });

  const dockHeader = () => resetAction().parentElement as HTMLElement;

  const settleCloseAutoFocus = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  const dragDockTo = (width: number) => {
    const separator = screen.getByRole('separator');
    const current = Number.parseInt(dockAside().style.width, 10);
    fireEvent.mouseDown(separator, { clientX: 0 });
    fireEvent.mouseMove(document, { clientX: current - width });
    fireEvent.mouseUp(document);
  };

  it('renders only the copilot panel', () => {
    render(<RightDock />);
    expect(screen.getByText('copilot-panel')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('gives the conversation region a stable id for the toggle to point at', () => {
    render(<RightDock />);
    const panel = document.getElementById(PANEL_ID);
    expect(panel).toBeInTheDocument();
    expect(panel).toContainElement(screen.getByText('copilot-panel'));
  });

  it('renders the new-conversation action once a conversation exists', () => {
    render(<RightDock />);
    expect(resetAction()).toBeInTheDocument();
  });

  it('starts a new conversation from the header action', () => {
    render(<RightDock />);

    fireEvent.click(resetAction());

    expect(agentState.newConversation).toHaveBeenCalledTimes(1);
  });

  it('gives the dock header the shared panel chrome without a label', () => {
    render(<RightDock />);

    expect(dockHeader()).toHaveClass(
      'h-12',
      'shrink-0',
      'border-b',
      'border-border',
      'px-4'
    );
    expect(dockHeader()).not.toHaveTextContent('ai.copilot.title');
  });

  it('drops the header band while the conversation is empty', () => {
    agentState.messages = [];

    render(<RightDock />);

    expect(
      screen.queryByRole('button', { name: /ai.copilot.newConversation/ })
    ).not.toBeInTheDocument();
    expect(dockAside().querySelector('.h-12')).toBeNull();
    expect(dockAside().querySelector('.border-b')).toBeNull();
  });

  it('names the dock for screen readers while the conversation is empty', () => {
    agentState.messages = [];

    render(<RightDock />);

    expect(
      screen.getByRole('heading', { name: 'ai.copilot.title' })
    ).toHaveClass('sr-only');
  });

  it('names the dock for screen readers once a conversation exists', () => {
    render(<RightDock />);

    expect(
      screen.getByRole('heading', { name: 'ai.copilot.title' })
    ).toHaveClass('sr-only');
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

  it('opens at a width that leaves the document its reserve', () => {
    render(<RightDock />);

    expect(dockAside().style.width).toBe('360px');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '500'
    );
  });

  it('caps the dock at the room left beside the reserved document', () => {
    window.innerWidth = 1200;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);

    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '384'
    );
  });

  it('brings a widened dock down when the sidebar takes the room', () => {
    render(<RightDock />);
    dragDockTo(500);
    expect(dockAside().style.width).toBe('500px');

    act(() => useSidebarStore.setState({ visibleWidth: 400 }));

    expect(dockAside().style.width).toBe('496px');
  });

  it('gives the width back when the room returns', () => {
    render(<RightDock />);
    dragDockTo(500);
    act(() => useSidebarStore.setState({ visibleWidth: 400 }));

    act(() => useSidebarStore.setState({ visibleWidth: 0 }));

    expect(dockAside().style.width).toBe('500px');
  });

  it('opens at the width the user chose in an earlier session', () => {
    useDockPreferenceStore.setState({ preferredWidth: 440 });

    render(<RightDock />);

    expect(dockAside().style.width).toBe('440px');
  });

  it('opens a remembered width no wider than the room beside the document', () => {
    useDockPreferenceStore.setState({ preferredWidth: 480 });
    window.innerWidth = 1200;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);
    expect(dockAside().style.width).toBe('384px');

    act(() => useSidebarStore.setState({ visibleWidth: 0 }));

    expect(dockAside().style.width).toBe('480px');
  });

  it('comes back at the width the user chose once the dialog gives the room back', async () => {
    render(<RightDock />);
    dragDockTo(480);
    act(() => useSidebarStore.setState({ visibleWidth: 700 }));
    await screen.findByRole('dialog', { name: 'ai.copilot.tab' });

    act(() => useSidebarStore.setState({ visibleWidth: 0 }));
    await settleCloseAutoFocus();

    expect(dockAside().style.width).toBe('480px');
  });

  it('never remembers a width the user resized a review to', async () => {
    window.innerWidth = 1400;
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });
    render(<RightDock />);
    await waitFor(() => expect(dockAside().style.width).toBe('840px'));

    dragDockTo(800);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    act(() => useRightDockStore.getState().closeReview());
    await waitFor(() => expect(dockAside().style.width).toBe('360px'));

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(360);
    expect(localStorage.getItem('notes-dock')).toBeNull();
  });

  it('presents the dock as a dialog when the document cannot keep its reserve', async () => {
    window.innerWidth = 1024;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('keeps the conversation and the draft when the presentation changes', async () => {
    agentState.draft = 'half typed idea';
    render(<RightDock />);
    expect(screen.getByRole('separator')).toBeInTheDocument();

    act(() => useSidebarStore.setState({ visibleWidth: 700 }));

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.getByText('copilot-panel')).toBeInTheDocument();
    expect(screen.getByText('half typed idea')).toBeInTheDocument();
    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('leaves focus where the user left it when the room turns the dock into a dialog', async () => {
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );
    const editor = screen.getByRole('textbox', { name: 'editor' });
    editor.focus();

    act(() => useSidebarStore.setState({ visibleWidth: 700 }));

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(editor).toHaveFocus();
  });

  it('leaves outside focus alone when the room brings the dialog back inline', async () => {
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );
    const editor = screen.getByRole('textbox', { name: 'editor' });
    editor.focus();
    act(() => useSidebarStore.setState({ visibleWidth: 700 }));
    await screen.findByRole('dialog', { name: 'ai.copilot.tab' });

    act(() => useSidebarStore.setState({ visibleWidth: 0 }));
    await settleCloseAutoFocus();

    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(editor).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('returns focus to the dock toggle when the dialog it held goes inline', async () => {
    useSidebarStore.setState({ visibleWidth: 700 });
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <RightDock />
      </>
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'ai.copilot.tab',
    });
    expect(dialog.contains(document.activeElement)).toBe(true);

    act(() => useSidebarStore.setState({ visibleWidth: 0 }));
    await settleCloseAutoFocus();

    expect(screen.getByRole('button', { name: 'toggle' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('focuses the dialog when the dock is opened into a room too small for it', async () => {
    useSidebarStore.setState({ visibleWidth: 700 });
    useRightDockStore.setState({ isOpen: false, reviewOpen: false });
    render(
      <>
        <button type="button" id="right-dock-toggle">
          toggle
        </button>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );
    const editor = screen.getByRole('textbox', { name: 'editor' });
    editor.focus();

    act(() => useRightDockStore.getState().open());

    const dialog = await screen.findByRole('dialog', {
      name: 'ai.copilot.tab',
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(editor).not.toHaveFocus();
  });

  it('leaves the page announced and clickable when the room turns the dock into a dialog', async () => {
    const view = render(
      <>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );

    act(() => useSidebarStore.setState({ visibleWidth: 700 }));

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(view.container).not.toHaveAttribute('aria-hidden');
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('keeps the page modal when the dock is opened into a room too small for it', async () => {
    useSidebarStore.setState({ visibleWidth: 700 });
    useRightDockStore.setState({ isOpen: false, reviewOpen: false });
    const view = render(
      <>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );

    act(() => useRightDockStore.getState().open());

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    await waitFor(() => expect(document.body.style.pointerEvents).toBe('none'));
    expect(view.container).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps a dialog the room opened non-modal while it stays open', async () => {
    const view = render(
      <>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );
    act(() => useSidebarStore.setState({ visibleWidth: 700 }));
    await screen.findByRole('dialog', { name: 'ai.copilot.tab' });
    const effectRunsInDialog = copilotPanel.effectRuns;

    act(() => useSidebarStore.setState({ visibleWidth: 720 }));
    act(() => useRightDockStore.setState({ reviewOpen: false }));
    await settleCloseAutoFocus();

    expect(
      screen.getByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(view.container).not.toHaveAttribute('aria-hidden');
    expect(copilotPanel.effectRuns).toBe(effectRunsInDialog);
  });

  it('keeps a review the sidebar sent into the dialog non-modal', async () => {
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });
    const view = render(
      <>
        <textarea aria-label="editor" />
        <RightDock />
      </>
    );
    await waitFor(() => expect(dockAside().style.width).toBe('864px'));

    act(() => useSidebarStore.setState({ visibleWidth: 700 }));

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(view.container).not.toHaveAttribute('aria-hidden');
    expect(useRightDockStore.getState().reviewOpen).toBe(true);
  });

  it('keeps a dialog the room opened while the user works in their note', async () => {
    render(
      <>
        <textarea aria-label="editor" />
        <button type="button">Outside</button>
        <RightDock />
      </>
    );
    const editor = screen.getByRole('textbox', { name: 'editor' });
    editor.focus();
    act(() => useSidebarStore.setState({ visibleWidth: 700 }));
    await screen.findByRole('dialog', { name: 'ai.copilot.tab' });
    await settleCloseAutoFocus();

    fireEvent.pointerDown(editor);
    fireEvent.click(editor);
    act(() => screen.getByRole('button', { name: 'Outside' }).focus());
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(true);
    expect(
      screen.getByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
  });

  it('still closes a dialog the room opened on Escape from inside it', async () => {
    render(<RightDock />);
    act(() => useSidebarStore.setState({ visibleWidth: 700 }));
    await screen.findByRole('dialog', { name: 'ai.copilot.tab' });
    const action = resetAction();
    act(() => action.focus());

    fireEvent.keyDown(action, { key: 'Escape' });

    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('keeps the dock inline down to its own minimum width', () => {
    window.innerWidth = 1116;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);

    expect(dockAside().style.width).toBe('300px');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '300'
    );
  });

  it('moves the dock into the dialog one pixel below its minimum', async () => {
    window.innerWidth = 1115;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('keeps the review inline down to the dock minimum width', async () => {
    window.innerWidth = 1116;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    await waitFor(() => expect(dockAside().style.width).toBe('670px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '670'
    );
  });

  it('moves a review into the dialog one pixel below the dock minimum', async () => {
    window.innerWidth = 1115;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.draft = 'half typed idea';
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.getByText('half typed idea')).toBeInTheDocument();
  });

  it('holds one presentation when a review opens into a room under a full dock', async () => {
    window.innerWidth = 1280;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: false });

    render(<RightDock />);

    await waitFor(() => expect(dockAside().style.width).toBe('768px'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useRightDockStore.getState().reviewOpen).toBe(true);
    expect(copilotPanel.effectRuns).toBe(1);
  });

  it('sends a review into the dialog when the sidebar takes its room', async () => {
    window.innerWidth = 1440;
    agentState.draft = 'half typed idea';
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });
    render(<RightDock />);
    await waitFor(() => expect(dockAside().style.width).toBe('864px'));

    act(() => useSidebarStore.setState({ visibleWidth: 700 }));

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.getByText('copilot-panel')).toBeInTheDocument();
    expect(screen.getByText('half typed idea')).toBeInTheDocument();
    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('lets a review outgrow the document reserve', async () => {
    window.innerWidth = 1400;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    await waitFor(() => expect(dockAside().style.width).toBe('840px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '840'
    );
  });

  it('gives a review its target width where the dock only gets the room', async () => {
    window.innerWidth = 1280;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    await waitFor(() => expect(dockAside().style.width).toBe('768px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '768'
    );
  });

  it('still caps the dock at the room on the viewport a review widens on', () => {
    window.innerWidth = 1280;
    useSidebarStore.setState({ visibleWidth: 272 });

    render(<RightDock />);

    expect(dockAside().style.width).toBe('360px');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '464'
    );
  });

  it('clamps a review to the space a wide sidebar leaves beside it', async () => {
    window.innerWidth = 1500;
    useSidebarStore.setState({ visibleWidth: 640 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    await waitFor(() => expect(dockAside().style.width).toBe('860px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '860'
    );
  });

  it('reviews in the dialog when no dock width leaves the reserve', async () => {
    window.innerWidth = 1024;
    useSidebarStore.setState({ visibleWidth: 272 });
    agentState.pendingProposal = { kind: 'update', targetNoteId: 'n1' };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    expect(
      await screen.findByRole('dialog', { name: 'ai.copilot.tab' })
    ).toBeVisible();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
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
    await waitFor(() => expect(aside.style.width).toBe('360px'));
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

  it('tracks viewport resizes outside a review too', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const resizeCalls = () =>
      addEventListener.mock.calls.filter(([type]) => type === 'resize');

    render(<RightDock />);

    expect(resizeCalls()).toHaveLength(1);
    addEventListener.mockRestore();
  });

  it('keeps the standard width when the pending proposal is not an update', () => {
    agentState.pendingProposal = { kind: 'create', targetNoteId: null };
    useRightDockStore.setState({ isOpen: true, reviewOpen: true });

    render(<RightDock />);

    expect(dockAside().style.width).toBe('360px');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '500'
    );
  });
});
