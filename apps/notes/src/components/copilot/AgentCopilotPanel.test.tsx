import type { ReactNode } from 'react';

import { useAgentStore } from '@/stores/agent.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import {
  agentClient,
  aiQuotaApi,
  ApiClientError,
  conversationsApi,
} from '@knowtis/api-client';
import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  AGENT_EMAIL_NOT_VERIFIED_CODE,
  AGENT_TURN_ERROR_CODE,
  AI_BYOK_KEY_FAILED_CODE,
  AI_QUOTA_EXHAUSTED_CODE,
  type AgentByokKeyFailedError,
  type ConversationTranscript,
  type QuotaUpgrade,
} from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { AgentCopilotPanel } from './AgentCopilotPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
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
    counter?: ReactNode;
    locked?: ReactNode;
  }) => (
    <div
      data-testid="composer"
      data-draft={props.draft}
      data-queue={props.queueLength}
    >
      {props.locked || (
        <>
          <button type="button" onClick={() => props.onSend('later')}>
            send
          </button>
          <button type="button" onClick={() => props.onSendNow('now')}>
            send-now
          </button>
        </>
      )}
      {props.counter}
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
    onQuota: vi.fn(() => () => undefined),
  },
  aiQuotaApi: { getQuota: vi.fn() },
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

beforeEach(() => {
  vi.mocked(aiQuotaApi.getQuota)
    .mockReset()
    .mockReturnValue(new Promise(() => undefined));
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
      hydration: 'unloaded',
      hasEarlier: false,
      retryMode: 'resend',
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

  it('names what the provider refused about the caller’s own key', () => {
    render(<AgentCopilotPanel />, { wrapper });
    const refused: AgentByokKeyFailedError = {
      code: AI_BYOK_KEY_FAILED_CODE,
      message: 'Your API key was refused by the provider.',
      provider: 'openai',
      kind: 'credit',
    };

    act(() => {
      useAgentStore.setState({ status: 'error', error: refused });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ai.errors.byokKeyFailed.credit'
    );
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

  it('offers no resend of the message when a proposal decision failed', () => {
    render(<AgentCopilotPanel />, { wrapper });

    act(() => {
      useAgentStore.setState({
        status: 'error',
        error: { code: 'AI_RATE_LIMIT_EXCEEDED', message: 'busy' },
        retryMode: 'none',
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ai.errors.rateLimited'
    );
    expect(
      screen.queryByRole('button', { name: 'ai.preview.retry' })
    ).not.toBeInTheDocument();
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

  it('shows a queue kept after the thread was found deleted instead of the empty state', () => {
    act(() => {
      useAgentStore.setState({
        messages: [],
        queue: [{ id: 'q1', text: 'Dos' }],
        error: {
          code: AGENT_CONVERSATION_NOT_FOUND_CODE,
          message: 'Conversation not found',
        },
      });
    });

    render(<AgentCopilotPanel />, { wrapper });

    expect(
      within(screen.getByRole('list', { name: 'ai.copilot.queue' })).getByText(
        'Dos'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('empty')).toBeNull();
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
      continuableTurnId: null,
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
        ['c1', undefined],
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
      await screen.findByText('ai.copilot.history.earlierFailed');
      expect(screen.queryByTestId('empty')).toBeNull();
      vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);
      await user.click(
        screen.getByRole('button', { name: 'ai.copilot.history.retry' })
      );

      expect(await screen.findByText('Day one.')).toBeInTheDocument();
      expect(conversationsApi.transcript).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByText('ai.copilot.history.earlierFailed')
      ).not.toBeInTheDocument();
    });

    function showFailedHistoryUnderALiveTurn() {
      useAgentStore.setState({
        userId: HARNESS_PROFILE.id,
        conversationId: 'c1',
        status: 'streaming',
        hydration: 'failed',
        messages: [
          { id: 'm1', turnId: 'turn-1', role: 'user', content: 'Mientras' },
          { id: 'm2', turnId: 'turn-1', role: 'assistant', content: 'Sigo' },
        ],
      });
    }

    it('offers the history retry above a message that outlived a failed load', async () => {
      showFailedHistoryUnderALiveTurn();
      vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);
      const user = userEvent.setup();

      render(<AgentCopilotPanel />, { wrapper });
      const retry = screen.getByRole('button', {
        name: 'ai.copilot.history.retry',
      });
      expect(
        retry.compareDocumentPosition(screen.getByText('Mientras')) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      await user.click(retry);

      expect(await screen.findByText('Day one.')).toBeInTheDocument();
      expect(screen.getByText('Sigo')).toBeInTheDocument();
      expect(useAgentStore.getState().status).toBe('streaming');
    });

    it('keeps focus on the retry while the history reloads, then hands it to the thread', async () => {
      showFailedHistoryUnderALiveTurn();
      let restore: (transcript: ConversationTranscript) => void = () =>
        undefined;
      vi.mocked(conversationsApi.transcript).mockReturnValue(
        new Promise((resolve) => {
          restore = resolve;
        })
      );
      const user = userEvent.setup();
      render(<AgentCopilotPanel />, { wrapper });

      screen.getByRole('button', { name: 'ai.copilot.history.retry' }).focus();
      await user.keyboard('{Enter}');
      const busy = screen.getByRole('button', { name: 'states.loading' });
      expect(busy).toHaveFocus();
      expect(busy).toHaveAttribute('aria-busy', 'true');

      await act(async () => {
        restore(TRANSCRIPT);
      });

      expect(await screen.findByText('Day one.')).toBeInTheDocument();
      expect(
        screen.queryByText('ai.copilot.history.earlierFailed')
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('log', { name: 'ai.copilot.history.thread' })
      ).toHaveFocus();
    });

    it('leaves the focus where the user moved it while the history reloaded', async () => {
      showFailedHistoryUnderALiveTurn();
      let restore: (transcript: ConversationTranscript) => void = () =>
        undefined;
      vi.mocked(conversationsApi.transcript).mockReturnValue(
        new Promise((resolve) => {
          restore = resolve;
        })
      );
      const user = userEvent.setup();
      render(<AgentCopilotPanel />, { wrapper });
      screen.getByRole('button', { name: 'ai.copilot.history.retry' }).focus();
      await user.keyboard('{Enter}');

      const elsewhere = screen.getByRole('button', { name: 'send-now' });
      elsewhere.focus();
      await act(async () => {
        restore(TRANSCRIPT);
      });

      expect(await screen.findByText('Day one.')).toBeInTheDocument();
      expect(elsewhere).toHaveFocus();
    });

    it('leaves focus on the retry when the history fails to load again', async () => {
      showFailedHistoryUnderALiveTurn();
      vi.mocked(conversationsApi.transcript).mockRejectedValue(
        new ApiClientError('boom', 500)
      );
      const user = userEvent.setup();
      render(<AgentCopilotPanel />, { wrapper });

      screen.getByRole('button', { name: 'ai.copilot.history.retry' }).focus();
      await user.keyboard('{Enter}');

      const retry = await screen.findByRole('button', {
        name: 'ai.copilot.history.retry',
      });
      expect(retry).toHaveFocus();
      expect(retry).not.toHaveAttribute('aria-busy', 'true');
      expect(conversationsApi.transcript).toHaveBeenCalledTimes(1);
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

  it('shows the refusal above a card the server gave back', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: createProposal,
        error: {
          code: AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
          message: 'send it again',
        },
        retryMode: 'none',
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ai.errors.turnUnavailable'
    );
    expect(
      screen.getByRole('group', { name: 'ai.copilot.proposal.createTitle' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ai.preview.retry' })
    ).not.toBeInTheDocument();
  });

  it('shows the refusal above a review the server gave back', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: updateProposal,
        error: {
          code: AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
          message: 'send it again',
        },
        retryMode: 'none',
      });
    });

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('ai.errors.turnUnavailable');
    expect(
      notice.compareDocumentPosition(screen.getByTestId('review')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'ai.preview.retry' })
    ).not.toBeInTheDocument();
  });

  it('shows no notice above an ordinary pending proposal', () => {
    render(<AgentCopilotPanel />, { wrapper });
    act(() => {
      useAgentStore.setState({
        status: 'pendingProposal',
        pendingProposal: createProposal,
      });
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

describe('AgentCopilotPanel daily quota', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const RESETS_AT = new Date(Date.now() + HOUR_MS).toISOString();
  const RESET_PASSED_AT = new Date(Date.now() - HOUR_MS).toISOString();

  const freshWrapper = () =>
    createAuthWrapper(createAuthApiMock(), { user: HARNESS_PROFILE });

  function refuseWith(details: { resetsAt?: string; upgrade?: QuotaUpgrade }) {
    act(() => {
      useAgentStore.setState({
        status: 'error',
        retryMode: 'none',
        draft: 'hola',
        error: {
          code: AI_QUOTA_EXHAUSTED_CODE,
          message: 'Daily messages spent',
          ...details,
        },
      });
    });
  }

  function refuseForTheDay(upgrade: QuotaUpgrade) {
    refuseWith({ resetsAt: RESETS_AT, upgrade });
  }

  beforeEach(() => {
    vi.mocked(agentClient.onQuota).mockClear();
    act(() => {
      useAgentStore.setState({
        status: 'idle',
        error: null,
        answeredError: null,
        messages: [],
        pendingProposal: null,
        queue: [],
        draft: '',
        retryMode: 'resend',
      });
    });
  });

  it('locks the composer instead of showing a banner when a send is refused for the day', () => {
    refuseForTheDay('byok');

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.quota.exhaustedToday'
    );
    expect(
      screen.getByRole('button', { name: 'ai.copilot.quota.byokCta' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'send' })).toBeNull();
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-draft',
      'hola'
    );
  });

  it('offers a guest an account when the refusal says to register', () => {
    refuseForTheDay('register');

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      screen.getByRole('button', { name: 'ai.copilot.quota.registerCta' })
    ).toBeInTheDocument();
  });

  it('locks the composer once today’s messages are spent', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'free',
      messages: { used: 30, limit: 30, resetsAt: RESETS_AT },
    });

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      await screen.findByRole('button', { name: 'ai.copilot.quota.byokCta' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.quota.exhausted'
    );
  });

  it('keeps the composer while the turn that spent the last message still runs', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'free',
      messages: { used: 30, limit: 30, resetsAt: RESETS_AT },
    });
    act(() => {
      useAgentStore.setState({
        status: 'streaming',
        messages: [
          { id: 'u1', role: 'user', content: 'hola' },
          { id: 'a1', role: 'assistant', content: '' },
        ],
      });
    });

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      await screen.findByText('ai.copilot.quota.remaining')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ai.copilot.quota.byokCta' })
    ).toBeNull();
  });

  it('reports a refusal the cached quota does not explain', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'anonymous',
      messages: { used: 3, limit: 5, resetsAt: RESETS_AT },
    });
    refuseForTheDay('register');

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      await screen.findByText('ai.copilot.quota.remaining')
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ai.copilot.quota.exhaustedToday'
    );
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-draft',
      'hola'
    );
  });

  it('reports a refusal that names no reset when the quota is unknown', () => {
    refuseWith({});

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ai.errors.rateLimited'
    );
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
  });

  it('drops a refusal whose reset has passed once messages are back', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'free',
      messages: { used: 0, limit: 30, resetsAt: RESETS_AT },
    });
    refuseWith({ resetsAt: RESET_PASSED_AT, upgrade: 'byok' });

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      await screen.findByText('ai.copilot.quota.remaining')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-draft',
      'hola'
    );
  });

  it('drops the refusal once a key moves the caller to the byok tier', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'byok',
      messages: null,
    });
    refuseForTheDay('byok');

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    expect(
      await screen.findByRole('button', { name: 'send' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('composer')).toHaveAttribute(
      'data-draft',
      'hola'
    );
  });

  it('neither counts nor locks for a byok caller', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue({
      tier: 'byok',
      messages: null,
    });

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    await waitFor(() => expect(aiQuotaApi.getQuota).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByText('ai.copilot.quota.remaining')).toBeNull();
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
  });

  it('does not lock the composer when the quota cannot be read', async () => {
    vi.mocked(aiQuotaApi.getQuota).mockRejectedValue(
      new ApiClientError('unavailable', 503)
    );

    render(<AgentCopilotPanel />, { wrapper: freshWrapper() });

    await waitFor(() => expect(aiQuotaApi.getQuota).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: 'send' })).toBeInTheDocument();
    expect(screen.queryByText('ai.copilot.quota.remaining')).toBeNull();
  });

  it('listens for quota pushes while mounted', () => {
    const unsubscribe = vi.fn();
    vi.mocked(agentClient.onQuota).mockReturnValueOnce(unsubscribe);

    const { unmount } = render(<AgentCopilotPanel />, {
      wrapper: freshWrapper(),
    });
    expect(agentClient.onQuota).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
