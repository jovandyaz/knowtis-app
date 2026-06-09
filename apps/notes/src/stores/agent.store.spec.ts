import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentClient } from '@knowtis/api-client';
import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentProposalPayload,
  AgentStreamHandle,
} from '@knowtis/api-client';

import { AGENT_STREAM_INACTIVITY_MS, useAgentStore } from './agent.store';

vi.mock('@knowtis/api-client', () => ({
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

interface Cbs {
  onChunk: (p: { text: string }) => void;
  onDone: (p: AgentDonePayload) => void;
  onError: (p: AgentErrorPayload) => void;
  onProposal?: (p: AgentProposalPayload) => void;
}

function capture(): {
  cancel: ReturnType<typeof vi.fn>;
  get: () => Cbs;
} {
  const cancel = vi.fn();
  let captured: Cbs | null = null;
  vi.mocked(agentClient.sendMessage).mockImplementation((_msgs, cbs) => {
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

  it('omits empty assistant placeholders from the wire history', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('first');
    get().onChunk({ text: 'answer' });
    vi.advanceTimersByTime(50);
    get().onDone({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
    });
    useAgentStore.getState().sendMessage('second');
    const sent = vi.mocked(agentClient.sendMessage).mock.calls[1][0];
    expect(sent).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' },
    ]);
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
    expect(sent).toEqual([{ role: 'user', content: 'hello' }]);
  });
});

describe('agent.store proposals', () => {
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
});
