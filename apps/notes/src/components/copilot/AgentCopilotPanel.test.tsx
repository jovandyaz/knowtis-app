import { useAgentStore } from '@/stores/agent.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import {
  agentClient,
  ApiClientError,
  conversationsApi,
} from '@knowtis/api-client';
import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  AGENT_EMAIL_NOT_VERIFIED_CODE,
  type ConversationTranscript,
} from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { AgentCopilotPanel } from './AgentCopilotPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const routeParams = vi.hoisted(() => ({ current: {} as { noteId?: string } }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => routeParams.current,
}));
vi.mock('./AgentComposer', () => ({
  AgentComposer: (props: {
    draft: string;
    queueLength: number;
    onSend: (text: string) => void;
    onSendNow: (text: string) => void;
  }) => (
    <div
      data-testid="composer"
      data-draft={props.draft}
      data-queue={props.queueLength}
    >
      <button type="button" onClick={() => props.onSend('later')}>
        send
      </button>
      <button type="button" onClick={() => props.onSendNow('now')}>
        send-now
      </button>
    </div>
  ),
}));
vi.mock('./CopilotModelPicker', () => ({
  CopilotModelPicker: () => null,
}));
vi.mock('./AgentEmptyState', () => ({
  AgentEmptyState: () => <div data-testid="empty" />,
}));
vi.mock('./ProposalReview', () => ({
  ProposalReview: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="review">
      <button type="button" onClick={onBack}>
        back
      </button>
    </div>
  ),
}));
vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    canResume: vi.fn(() => true),
    approve: vi.fn(),
    reject: vi.fn(),
    resetConversation: vi.fn(),
    resumeConversation: vi.fn(),
    setTokenProvider: vi.fn(),
    setAuthRefreshHandler: vi.fn(),
    setSessionExpiredHandler: vi.fn(),
  },
  conversationsApi: { transcript: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

const wrapper = createAuthWrapper(createAuthApiMock(), {
  user: HARNESS_PROFILE,
});

const anonymousWrapper = createAuthWrapper(createAuthApiMock(), {
  user: { ...HARNESS_PROFILE, isAnonymous: true },
});

function failWith(code: string) {
  act(() => {
    useAgentStore.setState({
      status: 'error',
      error: { code, message: 'refused' },
    });
  });
}

describe('AgentCopilotPanel', () => {
  beforeEach(() => {
    useVerifyEmailStore.setState({ isOpen: false });
    useRightDockStore.setState({ reviewOpen: false });
    useAgentStore.setState({
      status: 'idle',
      error: null,
      answeredError: null,
      messages: [],
      pendingProposal: null,
      queue: [],
      draft: '',
      userId: null,
      conversationId: null,
      conversationTitle: null,
      hydration: 'idle',
      hasEarlier: false,
    });
    vi.mocked(conversationsApi.transcript).mockReset();
    vi.mocked(agentClient.resumeConversation).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it('offers verification when the copilot share is refused for an unverified account', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('names the reason instead of a generic AI failure', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(screen.getByText('ai.errors.emailNotVerified')).toBeInTheDocument();
  });

  it('does not offer a code to a visitor with no address', () => {
    render(<AgentCopilotPanel />, { wrapper: anonymousWrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('does not tell a visitor with no address to verify one', () => {
    render(<AgentCopilotPanel />, { wrapper: anonymousWrapper });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(screen.getByText('ai.errors.generic')).toBeInTheDocument();
    expect(
      screen.queryByText('ai.errors.emailNotVerified')
    ).not.toBeInTheDocument();
  });

  it('does not offer again for a refusal it has already answered', () => {
    const { unmount } = render(<AgentCopilotPanel />, { wrapper });
    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);
    expect(useVerifyEmailStore.getState().isOpen).toBe(true);

    act(() => {
      useVerifyEmailStore.getState().close();
    });
    unmount();
    render(<AgentCopilotPanel />, { wrapper });

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('offers again when the copilot is refused a second time', () => {
    render(<AgentCopilotPanel />, { wrapper });
    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);
    act(() => {
      useVerifyEmailStore.getState().close();
    });

    failWith(AGENT_EMAIL_NOT_VERIFIED_CODE);

    expect(useVerifyEmailStore.getState().isOpen).toBe(true);
  });

  it('leaves any other copilot failure alone', () => {
    render(<AgentCopilotPanel />, { wrapper });

    failWith('AGENT_PERMISSION_DENIED');

    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('shows a stop notice when an empty assistant response ends', () => {
    useAgentStore.setState({
      status: 'done',
      messages: [
        { id: 'm1', role: 'user', content: 'Summarize this note' },
        {
          id: 'm2',
          role: 'assistant',
          content: '',
          stopReason: 'token_budget',
        },
      ],
    });

    const { unmount } = render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.token_budget'
    );

    unmount();
    render(<AgentCopilotPanel />, { wrapper });
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.token_budget'
    );
  });

  it('keeps partial assistant text and its sources with the stop notice', () => {
    useAgentStore.setState({
      status: 'done',
      messages: [
        { id: 'm1', role: 'user', content: 'Summarize this note' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Partial answer',
          sources: [{ id: 'n1', title: 'Productividad' }],
          stopReason: 'length',
        },
      ],
    });

    render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByText('Partial answer')).toBeInTheDocument();
    expect(screen.getByText('Productividad')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.stopReason.length'
    );
  });

  it('keeps a pending proposal available', () => {
    useAgentStore.setState({
      status: 'pendingProposal',
      messages: [
        { id: 'm1', role: 'user', content: 'Create a note' },
        { id: 'm2', role: 'assistant', content: '' },
      ],
      pendingProposal: {
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        payload: { title: 'GTD' },
      },
    });

    render(<AgentCopilotPanel />, { wrapper });

    expect(screen.getByText('GTD')).toBeInTheDocument();
  });

  it('passes the store draft and queue length to the composer', () => {
    act(() => {
      useAgentStore.setState({
        draft: 'typing',
        queue: [{ id: 'q1', text: 'later' }],
        messages: [{ id: 'u1', role: 'user', content: 'hola' }],
      });
    });
    render(<AgentCopilotPanel />, { wrapper });
    const composer = screen.getByTestId('composer');
    expect(composer).toHaveAttribute('data-draft', 'typing');
    expect(composer).toHaveAttribute('data-queue', '1');
  });

  it('queues a composer send, interrupts on send-now, and releases the queued row', async () => {
    const user = userEvent.setup();
    act(() => {
      useAgentStore.setState({
        status: 'streaming',
        messages: [
          { id: 'u1', role: 'user', content: 'hola' },
          { id: 'a1', role: 'assistant', content: '' },
        ],
      });
    });
    render(<AgentCopilotPanel />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'send' }));
    expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
      'later',
    ]);
    expect(screen.getByText('later')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'send-now' }));
    expect(useAgentStore.getState().messages.at(-2)?.content).toBe('now');
    expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
      'later',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'ai.copilot.queueSendNow' })
    );
    expect(useAgentStore.getState().messages.at(-2)?.content).toBe('later');
    expect(useAgentStore.getState().queue).toEqual([]);
  });

  describe('conversation history', () => {
    const TRANSCRIPT: ConversationTranscript = {
      id: 'c1',
      title: 'Trip',
      noteId: null,
      hasEarlier: false,
      messages: [
        {
          turnId: 't1',
          role: 'user',
          content: 'Plan it',
          sources: [],
          stopReason: null,
        },
        {
          turnId: 't1',
          role: 'assistant',
          content: 'Day one.',
          sources: [],
          stopReason: 'completed',
        },
      ],
    };

    it('restores the conversation this browser remembered for this user', async () => {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
      });
      vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);

      render(<AgentCopilotPanel />, { wrapper });

      expect(await screen.findByText('Day one.')).toBeInTheDocument();
      expect(vi.mocked(conversationsApi.transcript).mock.calls).toEqual([
        ['c1'],
      ]);
    });

    it("does not restore another account's conversation", async () => {
      useAgentStore.setState({ userId: 'someone-else', conversationId: 'c1' });

      render(<AgentCopilotPanel />, { wrapper });

      await waitFor(() =>
        expect(useAgentStore.getState().userId).toBe(HARNESS_PROFILE.id)
      );
      expect(useAgentStore.getState().conversationId).toBeNull();
      expect(conversationsApi.transcript).not.toHaveBeenCalled();
    });

    it('continues the remembered thread when a message goes out before it loads', async () => {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
      });
      vi.mocked(conversationsApi.transcript).mockReturnValue(
        new Promise(() => undefined)
      );
      const user = userEvent.setup();

      render(<AgentCopilotPanel />, { wrapper });
      await user.click(screen.getByRole('button', { name: 'send' }));

      expect(vi.mocked(agentClient.resumeConversation).mock.calls).toEqual([
        ['c1'],
      ]);
      expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[0]).toBe(
        'later'
      );
      expect(
        vi.mocked(agentClient.resumeConversation).mock.invocationCallOrder[0]
      ).toBeLessThan(
        vi.mocked(agentClient.sendMessage).mock.invocationCallOrder.at(-1) ??
          Number.NEGATIVE_INFINITY
      );
    });

    it('says the conversation is loading while it loads', async () => {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
      });
      vi.mocked(conversationsApi.transcript).mockReturnValue(
        new Promise(() => undefined)
      );

      render(<AgentCopilotPanel />, { wrapper });

      expect(await screen.findByRole('status')).toHaveTextContent(
        'ai.copilot.history.loading'
      );
      expect(screen.queryByText('ai.copilot.thinking')).toBeNull();
      expect(screen.queryByTestId('empty')).toBeNull();
    });

    it('offers a retry when the conversation fails to load', async () => {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
      });
      vi.mocked(conversationsApi.transcript).mockRejectedValue(
        new ApiClientError('boom', 500)
      );
      const user = userEvent.setup();

      render(<AgentCopilotPanel />, { wrapper });
      await screen.findByText('ai.copilot.history.loadFailed');
      await user.click(
        screen.getByRole('button', { name: 'ai.preview.retry' })
      );

      await waitFor(() =>
        expect(conversationsApi.transcript).toHaveBeenCalledTimes(2)
      );
    });

    it('opens the earlier-messages note when the thread was cut', async () => {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
      });
      vi.mocked(conversationsApi.transcript).mockResolvedValue({
        ...TRANSCRIPT,
        hasEarlier: true,
      });

      render(<AgentCopilotPanel />, { wrapper });

      expect(
        await screen.findByText('ai.copilot.history.earlier')
      ).toBeInTheDocument();
    });

    it('tells the user once when a send lands in a deleted conversation', () => {
      render(<AgentCopilotPanel />, { wrapper });

      act(() => {
        useAgentStore.setState({
          status: 'idle',
          error: {
            code: AGENT_CONVERSATION_NOT_FOUND_CODE,
            message: 'Conversation not found',
          },
        });
      });
      act(() => {
        useAgentStore.setState({ draft: 'typing on' });
      });

      expect(vi.mocked(toast.info).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ]);
    });

    it('does not repeat the notice when the dock reopens', () => {
      const { unmount } = render(<AgentCopilotPanel />, { wrapper });
      act(() => {
        useAgentStore.setState({
          status: 'idle',
          error: {
            code: AGENT_CONVERSATION_NOT_FOUND_CODE,
            message: 'Conversation not found',
          },
        });
      });

      unmount();
      render(<AgentCopilotPanel />, { wrapper });

      expect(vi.mocked(toast.info).mock.calls).toEqual([
        ['ai.copilot.history.gone'],
      ]);
    });
  });
});

describe('AgentCopilotPanel note context', () => {
  beforeEach(() => {
    routeParams.current = { noteId: 'note-1' };
    act(() => {
      useAgentStore.setState({ status: 'idle', messages: [], queue: [] });
    });
  });

  it('sends the note the route names before the editor has loaded', async () => {
    const user = userEvent.setup();
    render(<AgentCopilotPanel />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'send' }));

    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[2]).toBe(
      'note-1'
    );
  });

  it('queues a message with the note the route names', async () => {
    const user = userEvent.setup();
    act(() => useAgentStore.setState({ status: 'streaming' }));
    render(<AgentCopilotPanel />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'send' }));

    expect(useAgentStore.getState().queue.map((q) => q.noteId)).toEqual([
      'note-1',
    ]);
  });

  it('sends no note away from a note route', async () => {
    routeParams.current = {};
    const user = userEvent.setup();
    render(<AgentCopilotPanel />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'send' }));

    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[2]).toBe(
      undefined
    );
  });
});

const updateProposal = {
  id: 'p1',
  kind: 'update' as const,
  targetNoteId: 'n1',
  payload: { contentHtml: '<p>x</p>' },
};

const createProposal = {
  id: 'p2',
  kind: 'create' as const,
  targetNoteId: null,
  payload: { title: 'GTD', contentHtml: '<p>x</p>' },
};

describe('AgentCopilotPanel proposal routing', () => {
  beforeEach(() => {
    useRightDockStore.setState({ reviewOpen: false });
    useAgentStore.setState({
      status: 'idle',
      error: null,
      answeredError: null,
      messages: [],
      pendingProposal: null,
      queue: [],
      draft: '',
    });
  });

  it('shows the review instead of the chat for an update proposal', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
      });
    });
    expect(screen.getByTestId('review')).toBeInTheDocument();
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    expect(useRightDockStore.getState().reviewOpen).toBe(true);
  });

  it('returns to the chat with a pending row and reopens the review from it', async () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.pendingReview' })
    );
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('keeps the card for create proposals', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: createProposal,
      });
    });
    expect(screen.queryByTestId('review')).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'ai.copilot.proposal.createTitle' })
    ).toBeInTheDocument();
    expect(useRightDockStore.getState().reviewOpen).toBe(false);
  });

  it('closes the review when the panel unmounts', () => {
    const { unmount } = render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
      });
    });
    expect(useRightDockStore.getState().reviewOpen).toBe(true);

    unmount();

    expect(useRightDockStore.getState().reviewOpen).toBe(false);
  });

  it('reopens the review when the panel remounts with the proposal still pending', () => {
    const { unmount } = render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
      });
    });
    unmount();

    render(<AgentCopilotPanel />, { wrapper });

    expect(useRightDockStore.getState().reviewOpen).toBe(true);
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });

  it('closes the review flag when the proposal resolves', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
      });
    });
    act(() => {
      useAgentStore.setState({ status: 'streaming', pendingProposal: null });
    });
    expect(useRightDockStore.getState().reviewOpen).toBe(false);
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });
});
