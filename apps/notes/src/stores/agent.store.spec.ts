import { queryClient } from '@/lib/query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentClient } from '@knowtis/api-client';
import type {
  AgentCommittedPayload,
  AgentDonePayload,
  AgentErrorPayload,
  AgentProposalPayload,
  AgentStreamHandle,
} from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import { AGENT_STREAM_INACTIVITY_MS, useAgentStore } from './agent.store';

vi.mock('@knowtis/api-client', () => ({
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    approve: vi.fn(() => true),
    reject: vi.fn(() => true),
    resetConversation: vi.fn(),
  },
}));

vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

interface Cbs {
  onChunk: (p: { text: string }) => void;
  onDone: (p: AgentDonePayload) => void;
  onError: (p: AgentErrorPayload) => void;
  onProposal?: (p: AgentProposalPayload) => void;
  onCommitted?: (p: AgentCommittedPayload) => void;
}

function capture(): {
  cancel: ReturnType<typeof vi.fn>;
  get: () => Cbs;
} {
  const cancel = vi.fn();
  let captured: Cbs | null = null;
  vi.mocked(agentClient.sendMessage).mockImplementation((_text, cbs) => {
    captured = cbs as Cbs;
    return { cancel } as AgentStreamHandle;
  });
  return {
    cancel,
    get: () => {
      if (!captured) {
        throw new Error('callbacks not captured');
      }
      return captured;
    },
  };
}

describe('useAgentStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAgentStore.getState().newConversation();
  });

  afterEach(() => {
    useAgentStore.getState().newConversation();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('appends a user message and an empty assistant placeholder on send', () => {
    capture();
    useAgentStore.getState().sendMessage('hola');
    const { messages, status } = useAgentStore.getState();
    expect(status).toBe('streaming');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('hola');
    expect(messages[1].content).toBe('');
  });

  it('batches chunks into the assistant message', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onChunk({ text: 'Hel' });
    get().onChunk({ text: 'lo' });
    vi.advanceTimersByTime(50);
    const last = useAgentStore.getState().messages.at(-1);
    expect(last?.content).toBe('Hello');
  });

  it('attaches sources and marks done', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onChunk({ text: 'Hi' });
    vi.advanceTimersByTime(50);
    get().onDone({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [{ id: 'n1', title: 'Productividad' }],
      knownNotes: [],
    });
    const { status, messages } = useAgentStore.getState();
    expect(status).toBe('done');
    expect(messages.at(-1)?.sources).toEqual([
      { id: 'n1', title: 'Productividad' },
    ]);
  });

  it('times out and cancels after inactivity', () => {
    const { cancel } = capture();
    useAgentStore.getState().sendMessage('hola');
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
    expect(useAgentStore.getState().status).toBe('timeout');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('newConversation clears messages and resets status', () => {
    capture();
    useAgentStore.getState().sendMessage('hola');
    useAgentStore.getState().newConversation();
    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().status).toBe('idle');
  });

  it('sends only the trimmed message content on the wire', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('first');
    get().onChunk({ text: 'answer' });
    vi.advanceTimersByTime(50);
    get().onDone({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
    });
    useAgentStore.getState().sendMessage('  second  ');
    expect(vi.mocked(agentClient.sendMessage).mock.calls[0][0]).toBe('first');
    expect(vi.mocked(agentClient.sendMessage).mock.calls[1][0]).toBe('second');
  });

  it('cancel keeps partial content and returns to idle', () => {
    const { get, cancel } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onChunk({ text: 'partial' });
    vi.advanceTimersByTime(50);
    useAgentStore.getState().cancel();
    const { status, messages } = useAgentStore.getState();
    expect(status).toBe('idle');
    expect(cancel).toHaveBeenCalled();
    expect(messages.at(-1)?.content).toBe('partial');
  });

  it('retryLast replays the last user message after an error', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hello');
    get().onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' });

    capture();
    useAgentStore.getState().retryLast();

    const { messages, status } = useAgentStore.getState();
    expect(status).toBe('streaming');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('hello');
    const sent = vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0];
    expect(sent).toBe('hello');
  });
});

describe('agent.store server-authoritative wire', () => {
  const USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };
  const PROPOSAL: AgentProposalPayload = {
    id: 'p1',
    kind: 'create',
    targetNoteId: null,
    summary: 'Create "My Note"',
    previewHtml: null,
    payload: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(agentClient.approve).mockReturnValue(true);
    vi.mocked(agentClient.reject).mockReturnValue(true);
    useAgentStore.getState().newConversation();
  });

  afterEach(() => {
    useAgentStore.getState().newConversation();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('keeps the commit marker on the displayed message and sends only content', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.getState().approveProposal();
    get().onChunk({ text: 'Done, your note is ready.' });
    vi.advanceTimersByTime(50);
    get().onCommitted?.({
      proposalId: 'p1',
      result: { noteId: 'n1', title: 'My Note', kind: 'create' },
    });
    get().onDone({ usage: USAGE, sources: [], knownNotes: [] });

    const committedMsg = useAgentStore
      .getState()
      .messages.find((m) => m.committed);
    expect(committedMsg?.committed).toEqual({
      kind: 'create',
      title: 'My Note',
    });
    expect(committedMsg?.content).toContain('✓ My Note');

    useAgentStore.getState().sendMessage('what did you just do?');
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
      'what did you just do?'
    );
  });

  it('invalidates the notes cache when a proposal is committed', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.getState().approveProposal();
    get().onCommitted?.({
      proposalId: 'p1',
      result: { noteId: 'n1', title: 'My Note', kind: 'create' },
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: notesQueryKeys.lists() });
    expect(spy).toHaveBeenCalledWith({
      queryKey: notesQueryKeys.detail('n1'),
    });
  });

  it('still invalidates the notes cache when the stream was superseded', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.getState().approveProposal();
    const committed = get().onCommitted;

    useAgentStore.getState().newConversation();
    spy.mockClear();
    committed?.({
      proposalId: 'p1',
      result: { noteId: 'n1', title: 'My Note', kind: 'create' },
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: notesQueryKeys.lists() });
    expect(spy).toHaveBeenCalledWith({
      queryKey: notesQueryKeys.detail('n1'),
    });
    expect(
      useAgentStore.getState().messages.find((m) => m.committed)
    ).toBeUndefined();
  });

  it('keeps the proposal annotation on the displayed message', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);

    const proposedMsg = useAgentStore
      .getState()
      .messages.find((m) => m.proposal);
    expect(proposedMsg?.proposal).toEqual({
      kind: 'create',
      summary: 'Create "My Note"',
    });
  });

  it('attaches sources to the displayed message for rendering', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('what do my notes say?');
    get().onChunk({ text: 'They say X.' });
    vi.advanceTimersByTime(50);
    get().onDone({
      usage: USAGE,
      sources: [
        { id: 'n1', title: 'Productividad' },
        { id: 'n2', title: 'Ideas' },
      ],
      knownNotes: [],
    });

    expect(useAgentStore.getState().messages.at(-1)?.sources).toEqual([
      { id: 'n1', title: 'Productividad' },
      { id: 'n2', title: 'Ideas' },
    ]);
  });

  it('newConversation resets the server conversation', () => {
    capture();
    useAgentStore.getState().sendMessage('hola');
    vi.mocked(agentClient.resetConversation).mockClear();
    useAgentStore.getState().newConversation();
    expect(agentClient.resetConversation).toHaveBeenCalledTimes(1);
  });
});

describe('agent.store proposals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(agentClient.approve).mockReturnValue(true);
    vi.mocked(agentClient.reject).mockReturnValue(true);
    useAgentStore.getState().newConversation();
  });

  afterEach(() => {
    useAgentStore.getState().newConversation();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('approveProposal calls the client and returns to streaming', () => {
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 's',
        previewHtml: null,
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().approveProposal();
    expect(vi.mocked(agentClient.approve)).toHaveBeenCalledWith('p1');
    expect(useAgentStore.getState().status).toBe('streaming');
    expect(useAgentStore.getState().pendingProposal).toBeNull();
  });

  it('rejectProposal forwards the reason', () => {
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'update',
        targetNoteId: 'n1',
        summary: 's',
        previewHtml: null,
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().rejectProposal('too long');
    expect(vi.mocked(agentClient.reject)).toHaveBeenCalledWith(
      'p1',
      'too long'
    );
  });

  it('approveProposal fails fast when the client has no pending request', () => {
    vi.mocked(agentClient.approve).mockReturnValue(false);
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 's',
        previewHtml: null,
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().approveProposal();
    const { status, error, pendingProposal } = useAgentStore.getState();
    expect(status).toBe('error');
    expect(error?.code).toBe('AGENT_PROPOSAL_EXPIRED');
    expect(pendingProposal).toBeNull();
  });

  it('rejectProposal fails fast when the client has no pending request', () => {
    vi.mocked(agentClient.reject).mockReturnValue(false);
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'update',
        targetNoteId: 'n1',
        summary: 's',
        previewHtml: null,
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().rejectProposal('reason');
    const { status, error, pendingProposal } = useAgentStore.getState();
    expect(status).toBe('error');
    expect(error?.code).toBe('AGENT_PROPOSAL_EXPIRED');
    expect(pendingProposal).toBeNull();
  });

  it('approveProposal is a no-op without a pending proposal', () => {
    useAgentStore.setState({ pendingProposal: null, status: 'idle' });
    useAgentStore.getState().approveProposal();
    expect(vi.mocked(agentClient.approve)).not.toHaveBeenCalled();
    expect(useAgentStore.getState().status).toBe('idle');
  });

  it('rejectProposal is a no-op without a pending proposal', () => {
    useAgentStore.setState({ pendingProposal: null, status: 'idle' });
    useAgentStore.getState().rejectProposal('reason');
    expect(vi.mocked(agentClient.reject)).not.toHaveBeenCalled();
    expect(useAgentStore.getState().status).toBe('idle');
  });
});
