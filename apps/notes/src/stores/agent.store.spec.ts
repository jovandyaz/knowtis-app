import type { QueryKey } from '@tanstack/react-query';

import { aiQuotaQueryKeys } from '@/hooks/useAiQuota';
import { queryClient } from '@/lib/query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { agentClient, conversationsApi } from '@knowtis/api-client';
import type {
  AgentCommittedPayload,
  AgentDonePayload,
  AgentErrorPayload,
  AgentProposalPayload,
  AgentThinkingPayload,
  AgentTurnSettledPayload,
} from '@knowtis/api-client';
import { notesQueryKeys, tagsQueryKeys } from '@knowtis/data-access-notes';
import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  AGENT_PROPOSAL_EXPIRED_CODE,
  AGENT_TURN_ERROR_CODE,
  AGENT_TURN_NOT_CONTINUABLE_CODE,
  AI_BYOK_KEY_FAILED_CODE,
  AI_INVALID_INPUT_CODE,
  AI_QUOTA_EXHAUSTED_CODE,
  MESSAGE_KIND,
  type ConversationTranscript,
} from '@knowtis/shared-types';

import {
  AGENT_STREAM_INACTIVITY_MS,
  isTurnAlive,
  selectContinuableAnswer,
  THINKING_TAIL_CHARS,
  useAgentStore,
} from './agent.store';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    continueTurn: vi.fn(() => ({ turnId: 'turn-2', cancel: vi.fn() })),
    canResume: vi.fn(() => true),
    canResendTurn: vi.fn(() => false),
    approve: vi.fn(),
    reject: vi.fn(),
    resetConversation: vi.fn(),
    resumeConversation: vi.fn(),
  },
  conversationsApi: {
    transcript: vi
      .fn()
      .mockResolvedValue({ messages: [], title: null, hasEarlier: false }),
  },
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

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
  onThinking?: (p: AgentThinkingPayload) => void;
  onTurnSettled?: (p: AgentTurnSettledPayload) => void;
}

const SIDEBAR_RECENT_LIMIT = 20;

function seedNoteCaches(noteId: string): QueryKey[] {
  const keys = [
    notesQueryKeys.list(),
    notesQueryKeys.recent(SIDEBAR_RECENT_LIMIT),
    notesQueryKeys.counts(),
    tagsQueryKeys.tree(),
    notesQueryKeys.detail(noteId),
  ];
  for (const key of keys) {
    queryClient.setQueryData(key, {});
  }
  return keys;
}

function invalidationOf(keys: QueryKey[]) {
  return keys.map((key) => queryClient.getQueryState(key)?.isInvalidated);
}

function capture(turnId = 'turn-1'): {
  cancel: ReturnType<typeof vi.fn>;
  get: () => Cbs;
} {
  const cancel = vi.fn();
  let captured: Cbs | null = null;
  vi.mocked(agentClient.sendMessage).mockImplementation((_text, cbs) => {
    captured = cbs as Cbs;
    return { turnId, cancel };
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

const USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };

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

  it('waits longer than the server agent cap before declaring inactivity, so the server error surfaces first', () => {
    const SERVER_AGENT_MAX_MS = 300000;
    expect(AGENT_STREAM_INACTIVITY_MS).toBeGreaterThan(SERVER_AGENT_MAX_MS);
  });

  it.each([
    ['streaming', true],
    ['pendingProposal', true],
    ['idle', false],
    ['done', false],
    ['error', false],
    ['timeout', false],
  ] as const)('isTurnAlive(%s) is %s', (status, alive) => {
    expect(isTurnAlive(status)).toBe(alive);
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

  it('sends no effort while the conversation effort is auto', () => {
    capture();
    useAgentStore.getState().sendMessage('hola');
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual(
      {}
    );
  });

  it('the conversation effort rides every send while not auto', () => {
    capture();
    useAgentStore.getState().setReasoningEffort('medium');
    useAgentStore.getState().sendMessage('hola');
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual({
      effort: 'medium',
    });
  });

  it('the conversation effort also rides a retry', () => {
    const { get } = capture();
    useAgentStore.getState().setReasoningEffort('medium');
    useAgentStore.getState().sendMessage('hola');
    get().onError({ code: 'X', message: 'boom' });
    useAgentStore.getState().retryLast();
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual({
      effort: 'medium',
    });
  });

  it('a new conversation drops the effort so the next send carries none', () => {
    capture();
    useAgentStore.getState().setReasoningEffort('medium');
    useAgentStore.getState().newConversation();
    useAgentStore.getState().sendMessage('hola');
    expect(useAgentStore.getState().reasoningEffort).toBe('auto');
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual(
      {}
    );
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
      webSources: [],
      stopReason: 'completed',
    });
    const { status, messages } = useAgentStore.getState();
    expect(status).toBe('done');
    expect(messages.at(-1)?.sources).toEqual([
      { id: 'n1', title: 'Productividad' },
    ]);
  });

  it('keeps the stop reason on an empty done response', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');

    get().onDone({
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'token_budget',
    });

    expect(useAgentStore.getState().messages.at(-1)?.stopReason).toBe(
      'token_budget'
    );
    expect(useAgentStore.getState().status).toBe('done');
  });

  it('does not let a stale done callback mark the active response', () => {
    const first = capture();
    useAgentStore.getState().sendMessage('first');
    const staleDone = first.get().onDone;

    capture();
    useAgentStore.getState().sendMessage('second', undefined, {
      interrupt: true,
    });
    staleDone({
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'token_budget',
    });

    expect(
      useAgentStore.getState().messages.at(-1)?.stopReason
    ).toBeUndefined();
    expect(useAgentStore.getState().status).toBe('streaming');
  });

  it('starts a new response without the previous stop reason', () => {
    const first = capture();
    useAgentStore.getState().sendMessage('first');
    first.get().onDone({
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'length',
    });

    capture();
    useAgentStore.getState().sendMessage('second');

    expect(
      useAgentStore.getState().messages.at(-1)?.stopReason
    ).toBeUndefined();
  });

  it('captures successful copilot completion without response metadata', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('private prompt');

    get().onDone({
      usage: { inputTokens: 1, outputTokens: 2, model: 'private', costUsd: 3 },
      sources: [{ id: 'private-id', title: 'Private title' }],
      knownNotes: [],
      webSources: [{ title: 'Private source', url: 'https://example.com' }],
      stopReason: 'completed',
    });

    expect(captureProductEvent).toHaveBeenCalledWith('ai response completed', {
      source: 'copilot',
      assistant_type: 'agent',
    });
    expect(captureProductEvent).toHaveBeenCalledTimes(1);
  });

  it('does not capture completion after an error', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('first');
    get().onError({ code: 'X', message: 'failed' });
    get().onDone({
      usage: { inputTokens: 0, outputTokens: 0, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not capture completion after cancellation', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('second');
    useAgentStore.getState().cancel();
    get().onDone({
      usage: { inputTokens: 0, outputTokens: 0, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not capture completion after timeout', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('third');
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
    get().onDone({
      usage: { inputTokens: 0, outputTokens: 0, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not capture completion from a stale stream', () => {
    const first = capture();
    useAgentStore.getState().sendMessage('first');
    const staleDone = first.get().onDone;

    capture();
    useAgentStore.getState().sendMessage('second', undefined, {
      interrupt: true,
    });
    staleDone({
      usage: { inputTokens: 0, outputTokens: 0, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    expect(captureProductEvent).not.toHaveBeenCalled();
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
      webSources: [],
      stopReason: 'completed',
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

  describe('a message refused before the model ran', () => {
    const DONE: AgentDonePayload = {
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    };

    it.each([AI_INVALID_INPUT_CODE, AI_QUOTA_EXHAUSTED_CODE])(
      '%s takes its bubbles off the thread and gives the text back to the composer',
      (code) => {
        const earlier = capture('turn-0');
        useAgentStore.getState().sendMessage('earlier');
        earlier.get().onChunk({ text: 'answer' });
        earlier.get().onDone(DONE);
        const { get } = capture('turn-1');
        useAgentStore.getState().sendMessage('hello');
        const error: AgentErrorPayload = { code, message: 'refused' };

        get().onError(error);

        const {
          messages,
          draft,
          retryMode,
          status,
          error: shown,
        } = useAgentStore.getState();
        expect(messages.map((m) => m.content)).toEqual(['earlier', 'answer']);
        expect({ draft, retryMode, status, error: shown }).toEqual({
          draft: 'hello',
          retryMode: 'none',
          status: 'error',
          error,
        });
      }
    );

    it('puts the sent text before what the user typed since', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');
      useAgentStore.getState().setDraft('nuevo');

      get().onError({ code: AI_QUOTA_EXHAUSTED_CODE, message: 'spent' });

      expect(useAgentStore.getState().draft).toBe('hello\n\nnuevo');
    });

    it('a quota refusal folds the queued messages into the draft in order', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().sendMessage('third');
      useAgentStore.getState().setDraft('nuevo');

      get().onError({ code: AI_QUOTA_EXHAUSTED_CODE, message: 'spent' });

      const { draft, queue } = useAgentStore.getState();
      expect({ draft, queue }).toEqual({
        draft: 'hello\n\nsecond\n\nthird\n\nnuevo',
        queue: [],
      });
    });

    it('a quota refusal of a drained message folds the rest of the queue behind it', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().sendMessage('third');
      get().onDone(DONE);

      get().onError({ code: AI_QUOTA_EXHAUSTED_CODE, message: 'spent' });

      const { draft, queue } = useAgentStore.getState();
      expect({ draft, queue }).toEqual({
        draft: 'second\n\nthird',
        queue: [],
      });
    });

    it('an oversized message leaves the queue paused behind it', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');
      useAgentStore.getState().sendMessage('second');

      get().onError({ code: AI_INVALID_INPUT_CODE, message: 'too large' });

      const { draft, queue } = useAgentStore.getState();
      expect({ draft, queue: queue.map((q) => q.text) }).toEqual({
        draft: 'hello',
        queue: ['second'],
      });
    });

    it('leaves the turn it interrupted on the thread', () => {
      const interrupted = capture('turn-0');
      useAgentStore.getState().sendMessage('a');
      interrupted.get().onChunk({ text: 'partial' });
      vi.advanceTimersByTime(50);
      const { get } = capture('turn-1');
      useAgentStore.getState().sendMessage('b', undefined, {
        interrupt: true,
      });

      get().onError({ code: AI_QUOTA_EXHAUSTED_CODE, message: 'spent' });

      const { messages, draft } = useAgentStore.getState();
      expect(messages.map((m) => [m.turnId, m.content])).toEqual([
        ['turn-0', 'a'],
        ['turn-0', 'partial'],
      ]);
      expect(draft).toBe('b');
    });

    it('is not resent by retry', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');
      get().onError({ code: AI_INVALID_INPUT_CODE, message: 'too large' });

      useAgentStore.getState().retryLast();

      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
      expect(useAgentStore.getState().messages).toEqual([]);
    });
  });

  it.each([AI_BYOK_KEY_FAILED_CODE, AGENT_TURN_NOT_CONTINUABLE_CODE])(
    '%s keeps the turn on the thread and offers no resend',
    (code) => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');

      get().onError({ code, message: 'refused' });
      useAgentStore.getState().retryLast();

      const { messages, draft, retryMode, status } = useAgentStore.getState();
      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect({ draft, retryMode, status }).toEqual({
        draft: '',
        retryMode: 'none',
        status: 'error',
      });
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
    }
  );

  describe('the daily quota', () => {
    it('is refetched when a turn is done, in case its push was missed', () => {
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');

      get().onDone({
        usage: USAGE,
        sources: [],
        knownNotes: [],
        webSources: [],
        stopReason: 'completed',
      });

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: aiQuotaQueryKeys.all,
      });
    });

    it.each([
      'AI_PROVIDER_ERROR',
      AI_QUOTA_EXHAUSTED_CODE,
      AGENT_CONVERSATION_NOT_FOUND_CODE,
    ])('is refetched when a turn fails with %s', (code) => {
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const { get } = capture();
      useAgentStore.getState().sendMessage('hello');

      get().onError({ code, message: 'failed' });

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: aiQuotaQueryKeys.all,
      });
    });
  });

  describe('a queue behind the last message of the day', () => {
    const DONE: AgentDonePayload = {
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    };
    const RESETS_AT = '2026-10-03T00:00:00.000Z';

    function cacheQuota(used: number, limit: number) {
      useAgentStore.setState({ userId: 'u1' });
      queryClient.setQueryData(aiQuotaQueryKeys.forUser('u1'), {
        tier: 'free',
        messages: { used, limit, resetsAt: RESETS_AT },
      });
    }

    afterEach(() => {
      queryClient.removeQueries({ queryKey: aiQuotaQueryKeys.all });
      useAgentStore.setState({ userId: null });
    });

    it('is folded into the draft instead of sent into a quota known to be spent', () => {
      cacheQuota(30, 30);
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().sendMessage('third');
      useAgentStore.getState().setDraft('nuevo');

      get().onDone(DONE);

      const { draft, queue, status } = useAgentStore.getState();
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
      expect({ draft, queue, status }).toEqual({
        draft: 'second\n\nthird\n\nnuevo',
        queue: [],
        status: 'done',
      });
    });

    it('drains while the cached quota has messages left', () => {
      cacheQuota(29, 30);
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');

      get().onDone(DONE);

      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
        'second'
      );
    });
  });

  it('retries a turn that timed out under its own id', () => {
    capture();
    useAgentStore.getState().sendMessage('hello');
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
    vi.mocked(agentClient.canResendTurn).mockImplementationOnce(
      (turnId) => turnId === 'turn-1'
    );

    useAgentStore.getState().retryLast();

    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual({
      turnId: 'turn-1',
    });
  });

  describe('queue', () => {
    const DONE = {
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed' as const,
    };

    it('queues a message sent while streaming instead of cancelling the turn', () => {
      const { cancel } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second', 'note-2');

      const { queue, messages, status } = useAgentStore.getState();
      expect(status).toBe('streaming');
      expect(cancel).not.toHaveBeenCalled();
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
      expect(messages.map((m) => m.content)).toEqual(['first', '']);
      expect(queue).toEqual([
        { id: expect.any(String), text: 'second', noteId: 'note-2' },
      ]);
    });

    it('queues a message sent while a proposal is pending', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      get().onProposal?.({
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 's',
        payload: {},
      });
      useAgentStore.getState().sendMessage('second');
      expect(useAgentStore.getState().status).toBe('pendingProposal');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'second',
      ]);
    });

    it('drains the queue in order on done, with the note captured at enqueue time', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first', 'note-1');
      useAgentStore.getState().sendMessage('second', 'note-2');
      useAgentStore.getState().sendMessage('third', 'note-3');

      get().onDone(DONE);

      expect(useAgentStore.getState().status).toBe('streaming');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'third',
      ]);
      const calls = vi.mocked(agentClient.sendMessage).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1]?.[0]).toBe('second');
      expect(calls[1]?.[2]).toBe('note-2');
      expect(useAgentStore.getState().messages.map((m) => m.content)).toEqual([
        'first',
        '',
        'second',
        '',
      ]);

      get().onDone(DONE);
      expect(useAgentStore.getState().queue).toEqual([]);
      expect(calls).toHaveLength(3);
      expect(calls[2]?.[0]).toBe('third');
    });

    it('a drained turn carries the effort selected at drain time, not at enqueue time', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().setReasoningEffort('high');
      get().onDone(DONE);
      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[3]).toEqual(
        {
          effort: 'high',
        }
      );
    });

    it('ignores the superseded turn once a drained one takes over', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      const superseded = get();
      useAgentStore.getState().sendMessage('second');
      superseded.onThinking?.({ text: 'razonando' });
      vi.advanceTimersByTime(50);
      expect(useAgentStore.getState().thinkingText).toBe('razonando');

      superseded.onDone(DONE);

      expect(useAgentStore.getState().thinkingText).toBe('');
      expect(useAgentStore.getState().queue).toEqual([]);

      superseded.onChunk({ text: 'tarde' });
      superseded.onDone(DONE);
      vi.advanceTimersByTime(50);

      expect(useAgentStore.getState().status).toBe('streaming');
      expect(useAgentStore.getState().messages.map((m) => m.content)).toEqual([
        'first',
        '',
        'second',
        '',
      ]);
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(2);
    });

    it('keeps the queue and sends nothing on Stop', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().cancel();
      expect(useAgentStore.getState().status).toBe('idle');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'second',
      ]);
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
    });

    it('keeps the queue and sends nothing on error', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      get().onError({ code: 'X', message: 'boom' });
      expect(useAgentStore.getState().status).toBe('error');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'second',
      ]);
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
    });

    it('keeps the queue and sends nothing on the inactivity timeout', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
      expect(useAgentStore.getState().status).toBe('timeout');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'second',
      ]);
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
    });

    it('a message sent while paused goes first and re-arms draining', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('queued');
      useAgentStore.getState().cancel();

      useAgentStore.getState().sendMessage('fresh');
      const calls = vi.mocked(agentClient.sendMessage).mock.calls;
      expect(calls.at(-1)?.[0]).toBe('fresh');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'queued',
      ]);

      get().onDone(DONE);
      expect(calls.at(-1)?.[0]).toBe('queued');
      expect(useAgentStore.getState().queue).toEqual([]);
    });

    it('retry after an error resumes draining once the retried turn completes', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      get().onError({ code: 'X', message: 'boom' });
      useAgentStore.getState().retryLast();
      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
        'first'
      );
      get().onDone(DONE);
      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
        'second'
      );
    });

    it('drains after a proposal decision completes the resumed turn', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      get().onProposal?.({
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 's',
        payload: {},
      });
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().approveProposal();
      expect(useAgentStore.getState().status).toBe('streaming');
      get().onDone(DONE);
      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
        'second'
      );
    });

    it('interrupt cancels the live turn and sends immediately', () => {
      const { cancel } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore
        .getState()
        .sendMessage('now', undefined, { interrupt: true });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
        'now'
      );
      expect(useAgentStore.getState().queue).toEqual([]);
    });

    it('interrupt during a pending proposal drops the proposal', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('first');
      get().onProposal?.({
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        summary: 's',
        payload: {},
      });
      useAgentStore
        .getState()
        .sendMessage('now', undefined, { interrupt: true });
      expect(useAgentStore.getState().pendingProposal).toBeNull();
      expect(useAgentStore.getState().status).toBe('streaming');
    });

    it('a new conversation clears the queue', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().newConversation();
      expect(useAgentStore.getState().queue).toEqual([]);
    });

    it('reports the queue length when a message is queued', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().sendMessage('third');
      expect(captureProductEvent).toHaveBeenLastCalledWith(
        'ai message queued',
        {
          source: 'copilot',
          queue_length: 2,
        }
      );
    });

    it('removeQueued drops one item and leaves the rest in order', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('a');
      useAgentStore.getState().sendMessage('b');
      useAgentStore.getState().sendMessage('c');
      const target = useAgentStore.getState().queue[1].id;
      useAgentStore.getState().removeQueued(target);
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual([
        'a',
        'c',
      ]);
    });

    it('sendQueuedNow while paused sends that item immediately and keeps the others', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('a', 'note-a');
      useAgentStore.getState().sendMessage('b');
      useAgentStore.getState().cancel();

      const target = useAgentStore.getState().queue[1].id;
      useAgentStore.getState().sendQueuedNow(target);

      const call = vi.mocked(agentClient.sendMessage).mock.calls.at(-1);
      expect(call?.[0]).toBe('b');
      expect(useAgentStore.getState().status).toBe('streaming');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual(['a']);
    });

    it('sendQueuedNow while a turn is alive interrupts it', () => {
      const { cancel } = capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('a', 'note-a');
      const target = useAgentStore.getState().queue[0].id;
      useAgentStore.getState().sendQueuedNow(target);
      expect(cancel).toHaveBeenCalledTimes(1);
      const call = vi.mocked(agentClient.sendMessage).mock.calls.at(-1);
      expect(call?.[0]).toBe('a');
      expect(call?.[2]).toBe('note-a');
      expect(useAgentStore.getState().queue).toEqual([]);
    });

    it('sendQueuedNow ignores an unknown id', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendQueuedNow('nope');
      expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
    });

    it('takeBackQueued moves the newest item into the draft', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('a');
      useAgentStore.getState().sendMessage('b');
      useAgentStore.getState().takeBackQueued();
      expect(useAgentStore.getState().draft).toBe('b');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual(['a']);
    });

    it('takeBackQueued is a no-op while the draft has text', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('a');
      useAgentStore.getState().setDraft('typing');
      useAgentStore.getState().takeBackQueued();
      expect(useAgentStore.getState().draft).toBe('typing');
      expect(useAgentStore.getState().queue.map((q) => q.text)).toEqual(['a']);
    });

    it('takeBackQueued is a no-op on an empty queue', () => {
      useAgentStore.getState().takeBackQueued();
      expect(useAgentStore.getState().draft).toBe('');
    });

    it('a new conversation clears the draft', () => {
      useAgentStore.getState().setDraft('typing');
      useAgentStore.getState().newConversation();
      expect(useAgentStore.getState().draft).toBe('');
    });

    it('a new conversation that keeps the draft clears only the thread', () => {
      capture();
      useAgentStore.getState().sendMessage('first');
      useAgentStore.getState().sendMessage('second');
      useAgentStore.getState().setDraft('typing');

      useAgentStore.getState().newConversation({ keepDraft: true });

      const { messages, queue, draft } = useAgentStore.getState();
      expect({ messages, queue, draft }).toEqual({
        messages: [],
        queue: [],
        draft: 'typing',
      });
    });
  });
});

describe('agent.store server-authoritative wire', () => {
  const USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };
  const PROPOSAL: AgentProposalPayload = {
    id: 'p1',
    kind: 'create',
    targetNoteId: null,
    summary: 'Create "My Note"',
    payload: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(agentClient.canResume).mockReturnValue(true);
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
    get().onDone({
      usage: USAGE,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    const committedMsg = useAgentStore
      .getState()
      .messages.find((m) => m.committed);
    expect(committedMsg?.committed).toEqual({
      kind: 'create',
      title: 'My Note',
    });
    expect(committedMsg?.content).not.toContain('✓');

    useAgentStore.getState().sendMessage('what did you just do?');
    expect(vi.mocked(agentClient.sendMessage).mock.calls.at(-1)?.[0]).toBe(
      'what did you just do?'
    );
  });

  describe('the decision in flight', () => {
    function approve() {
      const turn = capture();
      useAgentStore.getState().sendMessage('create a note');
      turn.get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      return turn;
    }

    it('is forgotten on logout', () => {
      approve();
      expect(useAgentStore.getState().decisionInFlight?.proposal).toEqual(
        PROPOSAL
      );

      useAgentStore.getState().newConversation();

      expect(useAgentStore.getState().decisionInFlight).toBeNull();
    });

    it.each([
      [
        'its done',
        (cbs: Cbs) =>
          cbs.onDone({
            usage: USAGE,
            sources: [],
            knownNotes: [],
            webSources: [],
            stopReason: 'completed',
          }),
      ],
      [
        'an error',
        (cbs: Cbs) =>
          cbs.onError({
            code: 'AI_PROVIDER_ERROR',
            message: 'boom',
            turnId: 'turn-1',
          }),
      ],
      [
        'a refusal that gives the card back',
        (cbs: Cbs) =>
          cbs.onError({
            code: AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
            message: 'send it again',
          }),
      ],
      [
        'a new proposal',
        (cbs: Cbs) =>
          cbs.onProposal?.({
            id: 'p2',
            kind: 'update',
            targetNoteId: 'n1',
            summary: 'Update "My Note"',
            payload: {},
          }),
      ],
      ['Stop', () => useAgentStore.getState().cancel()],
      [
        'a conversation switch',
        () => void useAgentStore.getState().openConversation('c2', 'switcher'),
      ],
      [
        'the watchdog',
        () => vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS),
      ],
    ])('is forgotten once the turn ends with %s', (_end, end) => {
      const { get } = approve();

      end(get());

      expect(useAgentStore.getState().decisionInFlight).toBeNull();
    });
  });

  describe('a card the drain gave back', () => {
    const refusedBeforeTake = {
      code: AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
      message: 'The turn could not be started right now; send it again',
    };

    function approveAgainAfterTheCardCameBack() {
      const turn = capture();
      useAgentStore.getState().sendMessage('create a note');
      turn.get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      turn.get().onError(refusedBeforeTake);
      useAgentStore.getState().approveProposal();
      return turn;
    }

    it('still lets Stop end the client turn', () => {
      const { cancel } = approveAgainAfterTheCardCameBack();

      useAgentStore.getState().cancel();

      expect(cancel).toHaveBeenCalledOnce();
    });

    it('still ends the client turn on a conversation switch', async () => {
      const { cancel } = approveAgainAfterTheCardCameBack();

      await useAgentStore.getState().openConversation('conv-2', 'switcher');

      expect(cancel).toHaveBeenCalledOnce();
    });

    it('still ends the client turn on logout', () => {
      const { cancel } = approveAgainAfterTheCardCameBack();

      useAgentStore.getState().newConversation();

      expect(cancel).toHaveBeenCalledOnce();
    });

    it('still lets the watchdog end the client turn', () => {
      const { cancel } = approveAgainAfterTheCardCameBack();

      vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);

      expect(cancel).toHaveBeenCalledOnce();
    });
  });

  describe('a decision applied by a server too busy draining to resume it', () => {
    const resumeRefused = {
      code: AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
      message: 'The turn could not be started right now; send it again',
      turnId: 'turn-1',
    };

    it('ends an approved turn without an error and keeps its commit marker', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      get().onCommitted?.({
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'My Note', kind: 'create' },
      });

      get().onError(resumeRefused);

      const { status, error, messages } = useAgentStore.getState();
      expect(status).toBe('done');
      expect(error).toBeNull();
      expect(messages.find((m) => m.committed)?.committed).toEqual({
        kind: 'create',
        title: 'My Note',
      });
    });

    it('ends a resume the drain cut mid-reply as done, keeping its text and commit marker', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      get().onCommitted?.({
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'My Note', kind: 'create' },
      });
      get().onChunk({ text: 'Done, your note' });

      get().onError(resumeRefused);

      const { status, error, messages } = useAgentStore.getState();
      expect(status).toBe('done');
      expect(error).toBeNull();
      expect(messages.at(-1)).toMatchObject({
        content: 'Done, your note',
        committed: { kind: 'create', title: 'My Note' },
      });
    });

    it('ends a rejected turn without an error or an empty reply', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().rejectProposal();

      get().onError(resumeRefused);

      const { status, error, messages } = useAgentStore.getState();
      expect(status).toBe('done');
      expect(error).toBeNull();
      expect(
        messages.filter((m) => m.role === 'assistant' && m.content === '')
      ).toEqual([expect.objectContaining({ discarded: true })]);
    });

    it('gives the card back when an approve was refused before the server took it', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      const refused = {
        code: resumeRefused.code,
        message: resumeRefused.message,
      };

      get().onError(refused);

      const { status, error, pendingProposal, messages } =
        useAgentStore.getState();
      expect(status).toBe('pendingProposal');
      expect(error).toEqual(refused);
      expect(pendingProposal).toEqual(PROPOSAL);
      expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
      useAgentStore.getState().approveProposal();
      expect(vi.mocked(agentClient.approve).mock.calls).toEqual([
        ['p1'],
        ['p1'],
      ]);
      expect(useAgentStore.getState().error).toBeNull();
    });

    it('queues a message sent while the card is back, as behind any pending proposal', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      get().onError({
        code: resumeRefused.code,
        message: resumeRefused.message,
      });

      useAgentStore.getState().sendMessage('and tag it');

      const { queue, pendingProposal } = useAgentStore.getState();
      expect(queue.map((q) => q.text)).toEqual(['and tag it']);
      expect(pendingProposal).toEqual(PROPOSAL);
      expect(agentClient.sendMessage).toHaveBeenCalledOnce();
    });

    it('undoes the discard mark when a reject was refused before the server took it', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().rejectProposal('too long');

      get().onError({
        code: resumeRefused.code,
        message: resumeRefused.message,
      });

      const { pendingProposal, messages } = useAgentStore.getState();
      expect(pendingProposal).toEqual(PROPOSAL);
      expect(messages.some((m) => m.discarded)).toBe(false);
    });
  });

  describe('a decision refused before the server took its proposal', () => {
    function approve() {
      const turn = capture();
      useAgentStore.getState().sendMessage('create a note');
      turn.get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      return turn;
    }

    it.each([
      [
        'an internal failure',
        { code: 'AI_INTERNAL_ERROR', message: 'Agent turn failed' },
      ],
      [
        'AI being switched off',
        { code: 'AI_FEATURE_DISABLED', message: 'off' },
      ],
    ])('gives the approve card back after %s', (_why, refused) => {
      const { get } = approve();

      get().onError(refused);

      const { status, error, retryMode, pendingProposal, messages } =
        useAgentStore.getState();
      expect({ status, error, retryMode, pendingProposal }).toEqual({
        status: 'pendingProposal',
        error: refused,
        retryMode: 'none',
        pendingProposal: PROPOSAL,
      });
      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    });

    it('keeps the committed message when the resume then fails without a turn id', () => {
      const { get } = approve();
      get().onCommitted?.({
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'My Note', kind: 'create' },
      });
      const failure = {
        code: 'AI_INTERNAL_ERROR',
        message: 'Agent turn failed',
      };

      get().onError(failure);

      const { status, error, pendingProposal, messages } =
        useAgentStore.getState();
      expect({ status, error, pendingProposal }).toEqual({
        status: 'error',
        error: failure,
        pendingProposal: null,
      });
      expect(messages.find((m) => m.committed)?.committed).toEqual({
        kind: 'create',
        title: 'My Note',
      });
    });

    it('takes the discard mark off a reject refused before the take', () => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('create a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().rejectProposal('too long');

      get().onError({
        code: 'AI_INTERNAL_ERROR',
        message: 'Agent turn failed',
      });

      const { pendingProposal, messages } = useAgentStore.getState();
      expect(pendingProposal).toEqual(PROPOSAL);
      expect(messages.some((m) => m.discarded)).toBe(false);
    });

    it.each([
      [
        'the proposal expired',
        { code: AGENT_PROPOSAL_EXPIRED_CODE, message: 'expired' },
      ],
      [
        'the commit failed after the take',
        { code: 'AGENT_COMMIT_FAILED', message: 'failed', turnId: 'turn-1' },
      ],
      [
        'only the client lost the connection',
        { code: 'CONNECTION_FAILED', message: 'down' },
      ],
    ])('ends the turn when %s', (_why, failure) => {
      const { get } = approve();

      get().onError(failure);

      const { status, pendingProposal, retryMode } = useAgentStore.getState();
      expect({ status, pendingProposal, retryMode }).toEqual({
        status: 'error',
        pendingProposal: null,
        retryMode: 'none',
      });
    });
  });

  it.each(['create', 'update', 'share'] as const)(
    'invalidates the notes caches when a %s proposal is committed',
    (kind) => {
      const { get } = capture();
      useAgentStore.getState().sendMessage('change a note');
      get().onProposal?.(PROPOSAL);
      useAgentStore.getState().approveProposal();
      const keys = seedNoteCaches('n1');
      get().onCommitted?.({
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'My Note', kind },
      });

      expect(invalidationOf(keys)).toEqual([true, true, true, true, true]);
    }
  );

  it('still invalidates the notes cache when the stream was superseded', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.getState().approveProposal();
    const committed = get().onCommitted;

    useAgentStore.getState().newConversation();
    const keys = seedNoteCaches('n1');
    committed?.({
      proposalId: 'p1',
      result: { noteId: 'n1', title: 'My Note', kind: 'create' },
    });

    expect(invalidationOf(keys)).toEqual([true, true, true, true, true]);
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
    expect(proposedMsg?.proposal).toEqual({ kind: 'create' });
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
      webSources: [{ title: 'MDN', url: 'https://developer.mozilla.org' }],
      stopReason: 'completed',
    });

    expect(useAgentStore.getState().messages.at(-1)?.sources).toEqual([
      { id: 'n1', title: 'Productividad' },
      { id: 'n2', title: 'Ideas' },
    ]);
    expect(useAgentStore.getState().messages.at(-1)?.webSources).toEqual([
      { title: 'MDN', url: 'https://developer.mozilla.org' },
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
    vi.mocked(agentClient.canResume).mockReturnValue(true);
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

  it('approveProposal fails fast once the turn is closed', () => {
    vi.mocked(agentClient.canResume).mockReturnValue(false);
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'create',
        targetNoteId: null,
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().approveProposal();
    const { status, error, pendingProposal } = useAgentStore.getState();
    expect(status).toBe('error');
    expect(error?.code).toBe('AGENT_RESUME_UNAVAILABLE');
    expect(pendingProposal).toBeNull();
  });

  it('rejectProposal fails fast once the turn is closed', () => {
    vi.mocked(agentClient.canResume).mockReturnValue(false);
    useAgentStore.setState({
      pendingProposal: {
        id: 'p1',
        kind: 'update',
        targetNoteId: 'n1',
        payload: {},
      },
      status: 'pendingProposal',
    });
    useAgentStore.getState().rejectProposal('reason');
    const { status, error, pendingProposal } = useAgentStore.getState();
    expect(status).toBe('error');
    expect(error?.code).toBe('AGENT_RESUME_UNAVAILABLE');
    expect(pendingProposal).toBeNull();
  });

  it('does not arm the watchdog when the approve fails before streaming resumes', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.({
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 's',
      payload: {},
    });
    vi.mocked(agentClient.approve).mockImplementation(() => {
      get().onError({ code: 'CONNECTION_FAILED', message: 'down' });
    });

    useAgentStore.getState().approveProposal();
    expect(useAgentStore.getState().status).toBe('error');

    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
    expect(useAgentStore.getState().status).toBe('error');
  });

  const DECISION_REFUSAL_CODES = [
    AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS,
    'AI_RATE_LIMIT_EXCEEDED',
  ];

  function proposeThenDecide(decision: 'approve' | 'reject') {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.({
      turnId: 'turn-1',
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 's',
      payload: {},
    });
    if (decision === 'approve') {
      useAgentStore.getState().approveProposal();
      get().onCommitted?.({
        turnId: 'turn-1',
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'Trip', kind: 'create' },
      });
    } else {
      useAgentStore.getState().rejectProposal();
    }
    return get;
  }

  describe.each(DECISION_REFUSAL_CODES)(
    'when the server refuses the resumed leg with %s',
    (code) => {
      const refusal = { code, message: 'refused', turnId: 'turn-1' };

      it.each(['approve', 'reject'] as const)(
        'shows the %s decision as failed, resolved as the server left it',
        (decision) => {
          const get = proposeThenDecide(decision);

          get().onError(refusal);

          const { status, error, retryMode, pendingProposal, messages } =
            useAgentStore.getState();
          expect({ status, error, retryMode, pendingProposal }).toEqual({
            status: 'error',
            error: refusal,
            retryMode: 'none',
            pendingProposal: null,
          });
          expect(
            messages.some((m) =>
              decision === 'approve' ? m.committed : m.discarded
            )
          ).toBe(true);
        }
      );

      it.each(['approve', 'reject'] as const)(
        'never answers a failed %s decision by resending the message',
        (decision) => {
          const get = proposeThenDecide(decision);
          get().onError(refusal);

          useAgentStore.getState().retryLast();

          expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
          expect(useAgentStore.getState().status).toBe('error');
        }
      );
    }
  );

  it('never resends the message after the resumed leg times out', () => {
    proposeThenDecide('approve');
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);

    useAgentStore.getState().retryLast();

    const { status, retryMode } = useAgentStore.getState();
    expect({ status, retryMode }).toEqual({
      status: 'timeout',
      retryMode: 'none',
    });
    expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
  });

  it('never resends the message after a decision the client could not deliver', () => {
    vi.mocked(agentClient.canResume).mockReturnValue(false);
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.({
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 's',
      payload: {},
    });
    useAgentStore.getState().approveProposal();

    useAgentStore.getState().retryLast();

    expect(useAgentStore.getState().retryMode).toBe('none');
    expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledTimes(1);
  });

  it('retries the failure of a turn sent after a failed decision', () => {
    const get = proposeThenDecide('approve');
    get().onError({ code: 'CONNECTION_FAILED', message: 'down' });
    useAgentStore.getState().sendMessage('next question');
    get().onError({ code: 'AI_PROVIDER_ERROR', message: 'down' });

    useAgentStore.getState().retryLast();

    expect(useAgentStore.getState().retryMode).toBe('resend');
    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[0]).toBe(
      'next question'
    );
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

describe('agent.store thinking tail', () => {
  const DONE: AgentDonePayload = {
    usage: USAGE,
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: 'completed',
  };
  const PROPOSAL: AgentProposalPayload = {
    id: 'p1',
    kind: 'create',
    targetNoteId: null,
    summary: 'Create "My Note"',
    payload: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(agentClient.canResume).mockReturnValue(true);
    useAgentStore.getState().newConversation();
  });

  afterEach(() => {
    useAgentStore.getState().newConversation();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('accumulates a capped thinking tail after the flush window', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'razonando sobre la nota' });
    vi.advanceTimersByTime(50);
    expect(useAgentStore.getState().thinkingText).toBe(
      'razonando sobre la nota'
    );
  });

  it('keeps only the trailing window once reasoning exceeds the cap', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'a'.repeat(THINKING_TAIL_CHARS) });
    vi.advanceTimersByTime(50);
    get().onThinking?.({ text: 'b'.repeat(100) });
    vi.advanceTimersByTime(50);

    const { thinkingText } = useAgentStore.getState();
    expect(thinkingText).toHaveLength(THINKING_TAIL_CHARS);
    expect(thinkingText).toBe(
      'a'.repeat(THINKING_TAIL_CHARS - 100) + 'b'.repeat(100)
    );
  });

  it('retains more reasoning than the panel can show at once', () => {
    expect(THINKING_TAIL_CHARS).toBeGreaterThanOrEqual(2_000);
  });

  it('thinking activity resets the stream inactivity timer', () => {
    const { cancel, get } = capture();
    useAgentStore.getState().sendMessage('hola');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS - 1000);
      get().onThinking?.({ text: 'x' });
    }
    expect(useAgentStore.getState().status).toBe('streaming');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('ignores thinking from a superseded stream', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    const stale = get().onThinking;
    useAgentStore.getState().newConversation();

    stale?.({ text: 'stale reasoning' });
    vi.advanceTimersByTime(50);
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail when the turn ends', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'x' });
    vi.advanceTimersByTime(50);
    get().onDone(DONE);
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail on error', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'x' });
    vi.advanceTimersByTime(50);
    get().onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' });
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail when a proposal suspends the turn', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onThinking?.({ text: 'x' });
    vi.advanceTimersByTime(50);
    get().onProposal?.(PROPOSAL);
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail on cancel', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'x' });
    vi.advanceTimersByTime(50);
    useAgentStore.getState().cancel();
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail on newConversation', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'x' });
    vi.advanceTimersByTime(50);
    useAgentStore.getState().newConversation();
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('starts the next turn without the previous turn tail', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'previous turn reasoning' });
    vi.advanceTimersByTime(50);

    useAgentStore.getState().sendMessage('otra vez', undefined, {
      interrupt: true,
    });
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail when approving re-arms the stream', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.setState({ thinkingText: 'leftover' });

    useAgentStore.getState().approveProposal();
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('accumulates reasoning again once approving resumes the turn', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);

    useAgentStore.getState().approveProposal();
    expect(useAgentStore.getState().status).toBe('streaming');

    get().onThinking?.({ text: 'reasoning after approval' });
    vi.advanceTimersByTime(50);
    expect(useAgentStore.getState().thinkingText).toBe(
      'reasoning after approval'
    );
  });

  it('clears the thinking tail when rejecting re-arms the stream', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    useAgentStore.setState({ thinkingText: 'leftover' });

    useAgentStore.getState().rejectProposal('nope');
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail when the turn can no longer be resumed', () => {
    const { get } = capture();
    vi.mocked(agentClient.canResume).mockReturnValue(false);
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    get().onThinking?.({ text: 'reasoning after the proposal' });
    vi.advanceTimersByTime(50);

    useAgentStore.getState().approveProposal();
    expect(useAgentStore.getState().status).toBe('error');
    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('does not re-arm the inactivity watchdog while a proposal awaits approval', () => {
    const { cancel, get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    get().onThinking?.({ text: 'reasoning after the proposal' });

    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);

    expect(useAgentStore.getState().status).toBe('pendingProposal');
    expect(useAgentStore.getState().pendingProposal?.id).toBe('p1');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not repopulate the thinking tail while a proposal awaits approval', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('create a note');
    get().onProposal?.(PROPOSAL);
    get().onThinking?.({ text: 'reasoning after the proposal' });
    vi.advanceTimersByTime(50);

    expect(useAgentStore.getState().thinkingText).toBe('');
  });

  it('clears the thinking tail when the stream times out', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onThinking?.({ text: 'reasoning that stalls' });
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);

    expect(useAgentStore.getState().status).toBe('timeout');
    expect(useAgentStore.getState().thinkingText).toBe('');

    get().onThinking?.({ text: 'late reasoning' });
    vi.advanceTimersByTime(50);
    expect(useAgentStore.getState().thinkingText).toBe('');
  });
});

describe('agent.store the continue offer', () => {
  const DONE: AgentDonePayload = {
    usage: USAGE,
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: 'completed',
  };

  function answerCapped(continuable: boolean | undefined) {
    const { get } = capture('turn-1');
    useAgentStore.getState().sendMessage('Compara mis notas');
    get().onChunk({ text: 'Revisé tres notas.' });
    get().onDone({
      ...DONE,
      stopReason: 'max_steps',
      ...(continuable === undefined ? {} : { continuable }),
    });
  }

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

  it('is the turn the server reports continuable', () => {
    answerCapped(true);

    const state = useAgentStore.getState();
    expect(state.continuableTurnId).toBe('turn-1');
    expect(selectContinuableAnswer(state)).toMatchObject({
      turnId: 'turn-1',
      role: 'assistant',
      content: 'Revisé tres notas.',
      stopReason: 'max_steps',
    });
  });

  it.each([[false], [undefined]])(
    'is not made when the server reports continuable as %s',
    (continuable) => {
      answerCapped(continuable);

      expect(useAgentStore.getState().continuableTurnId).toBeNull();
    }
  );

  it('is withdrawn by the next message', () => {
    answerCapped(true);
    capture('turn-2');

    useAgentStore.getState().sendMessage('otra pregunta');

    const state = useAgentStore.getState();
    expect(state.continuableTurnId).toBeNull();
    expect(selectContinuableAnswer(state)).toBeNull();
  });

  it('is withdrawn by a new conversation', () => {
    answerCapped(true);

    useAgentStore.getState().newConversation();

    expect(useAgentStore.getState().continuableTurnId).toBeNull();
  });

  it('is not shown while a turn runs or under an answer of another turn', () => {
    answerCapped(true);
    const { messages } = useAgentStore.getState();

    expect(
      selectContinuableAnswer({
        messages,
        status: 'streaming',
        continuableTurnId: 'turn-1',
      })
    ).toBeNull();
    expect(
      selectContinuableAnswer({
        messages,
        status: 'done',
        continuableTurnId: 'turn-0',
      })
    ).toBeNull();
  });

  it('drops a stop reason this build does not know instead of showing its key', () => {
    const { get } = capture();
    useAgentStore.getState().sendMessage('hola');
    get().onChunk({ text: 'Listo.' });
    const fromNewerServer = {
      ...DONE,
      stopReason: 'reconsidered',
    } as unknown as AgentDonePayload;

    get().onDone(fromNewerServer);

    expect(useAgentStore.getState().messages.at(-1)).not.toHaveProperty(
      'stopReason'
    );
  });
});

describe('agent.store continuing a capped turn', () => {
  const CAPPED: AgentDonePayload = {
    usage: USAGE,
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: 'max_steps',
    continuable: true,
  };
  const RESETS_AT = '2026-10-03T00:00:00.000Z';

  function captureContinue(turnId = 'turn-2') {
    const cancel = vi.fn();
    let captured: Cbs | null = null;
    vi.mocked(agentClient.continueTurn).mockImplementation(
      (_continuesTurnId, cbs) => {
        captured = cbs as Cbs;
        return { turnId, cancel };
      }
    );
    return {
      cancel,
      get: (): Cbs => {
        if (!captured) {
          throw new Error('callbacks not captured');
        }
        return captured;
      },
    };
  }

  function capTurn() {
    const first = capture('turn-1');
    useAgentStore.getState().sendMessage('Compara mis notas');
    first.get().onChunk({ text: 'Revisé tres notas.' });
    first.get().onDone(CAPPED);
  }

  const turnIds = () => useAgentStore.getState().messages.map((m) => m.turnId);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAgentStore.getState().newConversation();
  });

  afterEach(() => {
    useAgentStore.getState().newConversation();
    useAgentStore.setState({ userId: null });
    queryClient.clear();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('sends a continue for the capped turn and shows a marker, not a bubble with text', () => {
    capTurn();
    captureContinue();

    useAgentStore.getState().continueTurn('note-1');

    expect(vi.mocked(agentClient.continueTurn)).toHaveBeenCalledExactlyOnceWith(
      'turn-1',
      expect.any(Object),
      'note-1',
      {}
    );
    const { messages, status, continuableTurnId } = useAgentStore.getState();
    expect({ status, continuableTurnId }).toEqual({
      status: 'streaming',
      continuableTurnId: null,
    });
    expect(
      messages.slice(-2).map(({ role, content, kind, turnId }) => ({
        role,
        content,
        kind,
        turnId,
      }))
    ).toEqual([
      {
        role: 'user',
        content: '',
        kind: MESSAGE_KIND.CONTINUE,
        turnId: 'turn-2',
      },
      { role: 'assistant', content: '', kind: undefined, turnId: 'turn-2' },
    ]);
  });

  it('sends and counts one continue however fast the user clicks twice', () => {
    capTurn();
    captureContinue();

    useAgentStore.getState().continueTurn();
    useAgentStore.getState().continueTurn();

    expect(vi.mocked(agentClient.continueTurn)).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(captureProductEvent)
        .mock.calls.filter(([event]) => event === 'ai continue clicked')
    ).toHaveLength(1);
  });

  it('moves the offer to the continuation when it is capped again', () => {
    capTurn();
    const continuation = captureContinue('turn-2');
    useAgentStore.getState().continueTurn();

    continuation.get().onChunk({ text: 'Sigo con el presupuesto.' });
    continuation.get().onDone(CAPPED);

    const state = useAgentStore.getState();
    expect(state.continuableTurnId).toBe('turn-2');
    expect(selectContinuableAnswer(state)?.content).toBe(
      'Sigo con el presupuesto.'
    );
  });

  it('captures the click with the tier and the stop reason', () => {
    useAgentStore.setState({ userId: 'u1' });
    queryClient.setQueryData(aiQuotaQueryKeys.forUser('u1'), {
      tier: 'free',
      messages: { used: 3, limit: 30, resetsAt: RESETS_AT },
    });
    capTurn();
    captureContinue();

    useAgentStore.getState().continueTurn();

    expect(captureProductEvent).toHaveBeenCalledWith('ai continue clicked', {
      tier: 'free',
      stop_reason: 'max_steps',
    });
  });

  describe('a continuation that fails before its first text', () => {
    it.each([
      [
        'the provider failing',
        { code: 'AI_PROVIDER_ERROR', message: 'boom', turnId: 'turn-2' },
      ],
      ['a lost connection', { code: 'CONNECTION_FAILED', message: 'down' }],
      [
        'the key being refused',
        { code: AI_BYOK_KEY_FAILED_CODE, message: 'refused', turnId: 'turn-2' },
      ],
    ])(
      'leaves the thread as it was and offers to continue again after %s',
      (_why, error) => {
        capTurn();
        const continuation = captureContinue();
        useAgentStore.getState().continueTurn();

        continuation.get().onError(error);

        const state = useAgentStore.getState();
        expect(turnIds()).toEqual(['turn-1', 'turn-1']);
        expect({
          status: state.status,
          error: state.error,
          retryMode: state.retryMode,
          continuableTurnId: state.continuableTurnId,
        }).toEqual({
          status: 'error',
          error,
          retryMode: 'none',
          continuableTurnId: 'turn-1',
        });
        expect(selectContinuableAnswer(state)?.turnId).toBe('turn-1');
      }
    );

    it('resends under the same turn id while the client still offers it', () => {
      capTurn();
      const continuation = captureContinue('turn-2');
      useAgentStore.getState().continueTurn();
      continuation
        .get()
        .onError({ code: 'CONNECTION_FAILED', message: 'down' });
      vi.mocked(agentClient.canResendTurn).mockReturnValueOnce(true);
      captureContinue('turn-2');

      useAgentStore.getState().continueTurn();

      expect(vi.mocked(agentClient.canResendTurn)).toHaveBeenCalledWith(
        'turn-2'
      );
      expect(
        vi.mocked(agentClient.continueTurn).mock.calls.at(-1)?.[3]
      ).toEqual({
        turnId: 'turn-2',
      });
    });

    it.each([AGENT_TURN_NOT_CONTINUABLE_CODE, AI_INVALID_INPUT_CODE])(
      'withdraws the offer when the server answers %s',
      (code) => {
        capTurn();
        const continuation = captureContinue();
        useAgentStore.getState().continueTurn();

        continuation
          .get()
          .onError({ code, message: 'refused', turnId: 'turn-2' });

        const state = useAgentStore.getState();
        expect(turnIds()).toEqual(['turn-1', 'turn-1']);
        expect(state.continuableTurnId).toBeNull();
        expect(selectContinuableAnswer(state)).toBeNull();
      }
    );

    it('reloads the thread when the server says the turn can no longer be continued', () => {
      useAgentStore.setState({ conversationId: 'conv-1' });
      capTurn();
      const continuation = captureContinue();
      useAgentStore.getState().continueTurn();
      vi.mocked(conversationsApi.transcript).mockClear();

      continuation.get().onError({
        code: AGENT_TURN_NOT_CONTINUABLE_CODE,
        message: 'no',
        turnId: 'turn-2',
      });

      expect(conversationsApi.transcript).toHaveBeenCalledWith(
        'conv-1',
        undefined
      );
    });

    it('folds the queue into the draft when the day’s messages are spent', () => {
      capTurn();
      const continuation = captureContinue();
      useAgentStore.getState().continueTurn();
      useAgentStore.getState().sendMessage('y luego esto');

      continuation.get().onError({
        code: AI_QUOTA_EXHAUSTED_CODE,
        message: 'spent',
        turnId: 'turn-2',
        resetsAt: RESETS_AT,
        upgrade: 'byok',
      });

      const { queue, draft, continuableTurnId } = useAgentStore.getState();
      expect({ queue, draft, continuableTurnId }).toEqual({
        queue: [],
        draft: 'y luego esto',
        continuableTurnId: 'turn-1',
      });
    });

    it('drops a continuation the user stopped before any text and offers it again', () => {
      capTurn();
      const continuation = captureContinue();
      useAgentStore.getState().continueTurn();

      useAgentStore.getState().cancel();

      expect(continuation.cancel).toHaveBeenCalledOnce();
      expect(turnIds()).toEqual(['turn-1', 'turn-1']);
      expect(useAgentStore.getState().continuableTurnId).toBe('turn-1');
    });

    it('resends a continuation the user stopped under the same turn id', () => {
      capTurn();
      captureContinue('turn-2');
      useAgentStore.getState().continueTurn();
      useAgentStore.getState().cancel();
      vi.mocked(agentClient.canResendTurn).mockReturnValueOnce(true);
      captureContinue('turn-2');

      useAgentStore.getState().continueTurn();

      expect(vi.mocked(agentClient.canResendTurn)).toHaveBeenCalledWith(
        'turn-2'
      );
      expect(
        vi.mocked(agentClient.continueTurn).mock.calls.at(-1)?.[3]
      ).toEqual({ turnId: 'turn-2' });
    });

    it('drops the marker of a continue the client refuses before sending it', () => {
      capTurn();
      vi.mocked(agentClient.continueTurn).mockImplementationOnce(
        (_continuesTurnId, cbs) => {
          cbs.onError({
            code: AGENT_TURN_NOT_CONTINUABLE_CODE,
            message: 'nothing to continue',
            turnId: 'turn-2',
          });
          return { turnId: 'turn-2', cancel: vi.fn() };
        }
      );

      useAgentStore.getState().continueTurn();
      vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);

      const { status, continuableTurnId } = useAgentStore.getState();
      expect(turnIds()).toEqual(['turn-1', 'turn-1']);
      expect({ status, continuableTurnId }).toEqual({
        status: 'error',
        continuableTurnId: null,
      });
    });
  });

  it('keeps a continuation that failed after it wrote text, with no retry', () => {
    capTurn();
    const continuation = captureContinue();
    useAgentStore.getState().continueTurn();
    continuation.get().onChunk({ text: 'Sigo con' });

    continuation.get().onError({
      code: 'AI_PROVIDER_ERROR',
      message: 'boom',
      turnId: 'turn-2',
    });

    const state = useAgentStore.getState();
    expect(state.messages.at(-1)?.content).toBe('Sigo con');
    expect({
      retryMode: state.retryMode,
      continuableTurnId: state.continuableTurnId,
    }).toEqual({
      retryMode: 'none',
      continuableTurnId: null,
    });
  });

  it('retries a timed-out continuation as a continue, never as an empty message', () => {
    capTurn();
    captureContinue('turn-2');
    useAgentStore.getState().continueTurn('note-1');
    vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
    expect(useAgentStore.getState().retryMode).toBe('resend');
    vi.mocked(agentClient.canResendTurn).mockReturnValueOnce(true);
    captureContinue('turn-2');

    useAgentStore.getState().retryLast();

    expect(vi.mocked(agentClient.sendMessage)).toHaveBeenCalledOnce();
    expect(vi.mocked(agentClient.continueTurn).mock.calls.at(-1)).toEqual([
      'turn-1',
      expect.any(Object),
      'note-1',
      { turnId: 'turn-2' },
    ]);
    expect(
      useAgentStore
        .getState()
        .messages.filter((m) => m.kind === MESSAGE_KIND.CONTINUE)
    ).toHaveLength(1);
  });

  describe('a message that replaces a continuation before its first text', () => {
    const STORED_CAPPED_TURN: ConversationTranscript = {
      id: 'conv-1',
      title: null,
      noteId: null,
      hasEarlier: false,
      messages: [
        {
          turnId: 'turn-1',
          role: 'user',
          content: 'Compara mis notas',
          sources: [],
          stopReason: null,
        },
        {
          turnId: 'turn-1',
          role: 'assistant',
          content: 'Revisé tres notas.',
          sources: [],
          stopReason: 'max_steps',
        },
      ],
      continuableTurnId: null,
    };

    function startContinuation() {
      useAgentStore.setState({ conversationId: 'conv-1' });
      capTurn();
      const continuation = captureContinue('turn-2');
      useAgentStore.getState().continueTurn();
      return continuation;
    }

    async function expectOnlyTheCappedTurnAndTheMessage() {
      expect(turnIds()).toEqual(['turn-1', 'turn-1', 'turn-3', 'turn-3']);
      vi.mocked(conversationsApi.transcript).mockResolvedValueOnce(
        STORED_CAPPED_TURN
      );
      await useAgentStore.getState().retryHydration();
      expect(turnIds()).toEqual(['turn-1', 'turn-1', 'turn-3', 'turn-3']);
    }

    it('drops the continuation a message sent now interrupts', async () => {
      startContinuation();
      capture('turn-3');

      useAgentStore
        .getState()
        .sendMessage('otra cosa', undefined, { interrupt: true });

      expect(useAgentStore.getState().continuableTurnId).toBeNull();
      await expectOnlyTheCappedTurnAndTheMessage();
    });

    it('drops the continuation a queued message sent now interrupts', async () => {
      startContinuation();
      useAgentStore.getState().sendMessage('otra cosa');
      const [queued] = useAgentStore.getState().queue;
      capture('turn-3');

      useAgentStore.getState().sendQueuedNow(queued.id);

      await expectOnlyTheCappedTurnAndTheMessage();
    });

    it('drops a timed-out continuation when a message follows it', async () => {
      startContinuation();
      vi.advanceTimersByTime(AGENT_STREAM_INACTIVITY_MS);
      capture('turn-3');

      useAgentStore.getState().sendMessage('otra cosa');

      await expectOnlyTheCappedTurnAndTheMessage();
    });

    it('drops a continuation whose stored answer could not be loaded when a message follows it', async () => {
      const continuation = startContinuation();
      vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
        new Error('boom')
      );
      continuation
        .get()
        .onTurnSettled?.({ turnId: 'turn-2', conversationId: 'conv-1' });
      await vi.waitFor(() =>
        expect(useAgentStore.getState().retryMode).toBe('reload')
      );
      capture('turn-3');

      useAgentStore.getState().sendMessage('otra cosa');

      await expectOnlyTheCappedTurnAndTheMessage();
    });

    it('keeps a continuation that wrote text when a message interrupts it, before the text is shown', () => {
      const continuation = startContinuation();
      continuation.get().onChunk({ text: 'Sigo con' });
      capture('turn-3');

      useAgentStore
        .getState()
        .sendMessage('otra cosa', undefined, { interrupt: true });

      const { messages } = useAgentStore.getState();
      expect(messages.map((m) => [m.turnId, m.content])).toEqual([
        ['turn-1', 'Compara mis notas'],
        ['turn-1', 'Revisé tres notas.'],
        ['turn-2', ''],
        ['turn-2', 'Sigo con'],
        ['turn-3', 'otra cosa'],
        ['turn-3', ''],
      ]);
    });
  });
});
