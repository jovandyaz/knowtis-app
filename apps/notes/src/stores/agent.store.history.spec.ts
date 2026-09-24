import { queryClient } from '@/lib/query-client';
import { refuseStorage } from '@/test/refuse-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import {
  agentClient,
  ApiClientError,
  conversationsApi,
} from '@knowtis/api-client';
import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentProposalPayload,
  AgentTurnSettledPayload,
} from '@knowtis/api-client';
import { conversationsQueryKeys } from '@knowtis/data-access-agent';
import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  type ConversationTranscript,
} from '@knowtis/shared-types';
import { COPILOT_CONVERSATION_STORAGE_KEY } from '@knowtis/shared-util';

import { AGENT_STREAM_INACTIVITY_MS, useAgentStore } from './agent.store';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    canResume: vi.fn(() => true),
    canResendTurn: vi.fn(() => false),
    approve: vi.fn(),
    reject: vi.fn(),
    resetConversation: vi.fn(),
    resumeConversation: vi.fn(),
  },
  conversationsApi: { transcript: vi.fn() },
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));
vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

interface Callbacks {
  onChunk: (payload: { text: string }) => void;
  onDone: (payload: AgentDonePayload) => void;
  onError: (payload: AgentErrorPayload) => void;
  onProposal?: (payload: AgentProposalPayload) => void;
  onConversation?: (conversationId: string) => void;
  onTurnSettled: (payload: AgentTurnSettledPayload) => void;
}

function capture() {
  const cancel = vi.fn();
  let captured: Callbacks | null = null;
  vi.mocked(agentClient.sendMessage).mockImplementation((_text, callbacks) => {
    captured = callbacks as Callbacks;
    return { turnId: 'turn-1', cancel };
  });
  return {
    cancel,
    callbacks: (): Callbacks => {
      if (!captured) {
        throw new Error('callbacks not captured');
      }
      return captured;
    },
  };
}

const DONE: AgentDonePayload = {
  usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
  sources: [],
  knownNotes: [],
  webSources: [],
  stopReason: 'completed',
};

const SWITCHER_LIMIT = 25;

beforeEach(() => {
  useAgentStore.getState().newConversation();
  useAgentStore.setState({ userId: null });
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  useAgentStore.getState().newConversation();
});

describe('agent.store conversation identity', () => {
  it('adopts the conversation the server announces and names it after the first message', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Plan a trip\n\nto Oaxaca');

    callbacks().onConversation?.('c1');

    const { conversationId, conversationTitle } = useAgentStore.getState();
    expect({ conversationId, conversationTitle }).toEqual({
      conversationId: 'c1',
      conversationTitle: 'Plan a trip to Oaxaca',
    });
  });

  it('keeps the title of a thread it already knows', () => {
    useAgentStore.setState({
      conversationId: 'c1',
      conversationTitle: 'Renamed',
    });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('another question');

    callbacks().onConversation?.('c1');

    expect(useAgentStore.getState().conversationTitle).toBe('Renamed');
  });

  it('ignores an announcement from a stream the user already left', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');
    const left = callbacks();
    useAgentStore.getState().newConversation();

    left.onConversation?.('c-late');

    expect(useAgentStore.getState().conversationId).toBeNull();
  });

  it('refreshes the conversation list when a turn completes', () => {
    queryClient.setQueryData(conversationsQueryKeys.list(SWITCHER_LIMIT), {});
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');

    callbacks().onDone(DONE);

    expect(
      queryClient.getQueryState(conversationsQueryKeys.list(SWITCHER_LIMIT))
        ?.isInvalidated
    ).toBe(true);
  });

  it('refreshes the conversation list when a turn stops on a proposal', () => {
    queryClient.setQueryData(conversationsQueryKeys.list(SWITCHER_LIMIT), {});
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Crea la nota');

    callbacks().onProposal?.({
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 'Create',
      payload: {},
    });

    expect(
      queryClient.getQueryState(conversationsQueryKeys.list(SWITCHER_LIMIT))
        ?.isInvalidated
    ).toBe(true);
  });

  it('refreshes the conversation list when a turn fails', () => {
    queryClient.setQueryData(conversationsQueryKeys.list(SWITCHER_LIMIT), {});
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');

    callbacks().onError({ code: 'AI_PROVIDER_ERROR', message: 'down' });

    expect(
      queryClient.getQueryState(conversationsQueryKeys.list(SWITCHER_LIMIT))
        ?.isInvalidated
    ).toBe(true);
  });

  it('forgets the thread on newConversation but remembers whose browser it is', () => {
    useAgentStore.setState({
      userId: 'u1',
      conversationId: 'c1',
      conversationTitle: 'T',
    });

    useAgentStore.getState().newConversation();

    const { userId, conversationId, conversationTitle } =
      useAgentStore.getState();
    expect({ userId, conversationId, conversationTitle }).toEqual({
      userId: 'u1',
      conversationId: null,
      conversationTitle: null,
    });
  });

  it('persists only the user and the conversation id', () => {
    useAgentStore.getState().bindUser('u1');
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');
    callbacks().onConversation?.('c1');

    const stored = JSON.parse(
      localStorage.getItem(COPILOT_CONVERSATION_STORAGE_KEY) ?? '{}'
    ) as { state?: unknown };
    expect(stored.state).toEqual({ userId: 'u1', conversationId: 'c1' });
  });

  it('forgets a conversation that belongs to another account', () => {
    useAgentStore.setState({ userId: 'u1', conversationId: 'c1' });

    useAgentStore.getState().bindUser('u2');

    const { userId, conversationId } = useAgentStore.getState();
    expect({ userId, conversationId }).toEqual({
      userId: 'u2',
      conversationId: null,
    });
    expect(agentClient.resetConversation).toHaveBeenCalledTimes(1);
  });

  it('keeps the conversation of the same account', () => {
    useAgentStore.setState({ userId: 'u1', conversationId: 'c1' });

    useAgentStore.getState().bindUser('u1');

    expect(useAgentStore.getState().conversationId).toBe('c1');
  });

  it('forgets an id whose owner it never recorded', () => {
    useAgentStore.setState({ userId: null, conversationId: 'c1' });

    useAgentStore.getState().bindUser('u1');

    expect(useAgentStore.getState().conversationId).toBeNull();
  });
});

const TRANSCRIPT: ConversationTranscript = {
  id: 'c1',
  title: 'Trip',
  noteId: null,
  hasEarlier: true,
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const contents = () =>
  useAgentStore.getState().messages.map((message) => message.content);

describe('agent.store openConversation', () => {
  it('binds the client to the thread before fetching it', () => {
    vi.mocked(conversationsApi.transcript).mockReturnValue(
      deferred<ConversationTranscript>().promise
    );

    void useAgentStore.getState().openConversation('c1', 'switcher');

    const resumed = vi.mocked(agentClient.resumeConversation).mock
      .invocationCallOrder[0];
    const fetched = vi.mocked(conversationsApi.transcript).mock
      .invocationCallOrder[0];
    expect(resumed).toBeLessThan(fetched);
    const { conversationId, hydration, messages } = useAgentStore.getState();
    expect({ conversationId, hydration, messages }).toEqual({
      conversationId: 'c1',
      hydration: 'loading',
      messages: [],
    });
  });

  it('shows the transcript it fetched', async () => {
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);

    const outcome = await useAgentStore
      .getState()
      .openConversation('c1', 'switcher');

    const state = useAgentStore.getState();
    expect(outcome).toBe('opened');
    expect(state.messages).toEqual([
      {
        id: expect.any(String),
        turnId: 't1',
        role: 'user',
        content: 'Plan it',
      },
      {
        id: expect.any(String),
        turnId: 't1',
        role: 'assistant',
        content: 'Day one.',
        sources: [],
        stopReason: 'completed',
      },
    ]);
    expect([
      state.conversationTitle,
      state.hasEarlier,
      state.hydration,
    ]).toEqual(['Trip', true, 'loaded']);
    expect(captureProductEvent).toHaveBeenCalledWith('ai conversation opened', {
      source: 'switcher',
    });
  });

  it('keeps the draft and drops the queue', async () => {
    useAgentStore.setState({
      draft: 'half typed',
      queue: [{ id: 'q1', text: 'later' }],
    });
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);

    await useAgentStore.getState().openConversation('c1', 'switcher');

    expect([
      useAgentStore.getState().draft,
      useAgentStore.getState().queue,
    ]).toEqual(['half typed', []]);
  });

  it('cancels the live turn before switching and ignores its late chunks', async () => {
    const { cancel, callbacks } = capture();
    useAgentStore.getState().sendMessage('first');
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);

    await useAgentStore.getState().openConversation('c1', 'switcher');
    callbacks().onChunk({ text: 'late' });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(contents()).toEqual(['Plan it', 'Day one.']);
  });

  it('drops a transcript that lands after the user moved to another thread', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript)
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(deferred<ConversationTranscript>().promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    void useAgentStore.getState().openConversation('c2', 'switcher');

    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('superseded');
    const { conversationId, conversationTitle, messages, hydration } =
      useAgentStore.getState();
    expect({ conversationId, conversationTitle, messages, hydration }).toEqual({
      conversationId: 'c2',
      conversationTitle: null,
      messages: [],
      hydration: 'loading',
    });
  });

  it('shows the earlier messages above a message sent while the thread loaded', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    capture();
    useAgentStore.getState().sendMessage('new question');

    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('opened');
    expect(contents()).toEqual(['Plan it', 'Day one.', 'new question', '']);
    const { conversationTitle, hasEarlier, hydration } =
      useAgentStore.getState();
    expect({ conversationTitle, hasEarlier, hydration }).toEqual({
      conversationTitle: 'Trip',
      hasEarlier: true,
      hydration: 'loaded',
    });
  });

  it('keeps streaming the answer to a message sent while the thread loaded', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    pending.resolve(TRANSCRIPT);
    await opening;

    callbacks().onChunk({ text: 'Day two.' });
    callbacks().onDone(DONE);

    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Day two.',
    ]);
    expect(useAgentStore.getState().status).toBe('done');
  });

  it('shows the earlier messages once without refetching when the thread is reopened', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    capture();
    useAgentStore.getState().sendMessage('new question');
    pending.resolve(TRANSCRIPT);
    await opening;

    const again = await useAgentStore
      .getState()
      .openConversation('c1', 'switcher');

    expect(again).toBe('unchanged');
    expect(contents()).toEqual(['Plan it', 'Day one.', 'new question', '']);
    expect(conversationsApi.transcript).toHaveBeenCalledTimes(1);
  });

  it('drops the transcript of a thread a message found deleted while it loaded', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    callbacks().onError({
      code: AGENT_CONVERSATION_NOT_FOUND_CODE,
      message: 'Conversation not found',
    });

    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('superseded');
    const { conversationId, conversationTitle, messages } =
      useAgentStore.getState();
    expect({ conversationId, conversationTitle, messages }).toEqual({
      conversationId: null,
      conversationTitle: null,
      messages: [],
    });
  });

  it('keeps a rename saved before a message sent while the thread loaded', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    useAgentStore.getState().setConversationTitle('Renamed meanwhile');

    capture();
    useAgentStore.getState().sendMessage('new question');
    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('opened');
    expect(useAgentStore.getState().conversationTitle).toBe(
      'Renamed meanwhile'
    );
  });

  it('keeps a rename saved while the transcript was loading', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    useAgentStore.getState().setConversationTitle('Renamed meanwhile');

    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('opened');
    expect(useAgentStore.getState().conversationTitle).toBe(
      'Renamed meanwhile'
    );
  });

  it('does not name a different thread from a superseded transcript', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    useAgentStore.getState().newConversation();

    pending.resolve(TRANSCRIPT);

    expect(await opening).toBe('superseded');
    const { conversationId, conversationTitle } = useAgentStore.getState();
    expect({ conversationId, conversationTitle }).toEqual({
      conversationId: null,
      conversationTitle: null,
    });
  });

  it('forgets a conversation that is gone', async () => {
    vi.mocked(conversationsApi.transcript).mockRejectedValue(
      new ApiClientError('Conversation not found', 404)
    );

    const outcome = await useAgentStore
      .getState()
      .openConversation('c1', 'reload');

    const { conversationId, hydration } = useAgentStore.getState();
    expect([outcome, conversationId, hydration]).toEqual([
      'gone',
      null,
      'unloaded',
    ]);
    expect(agentClient.resetConversation).toHaveBeenCalledTimes(1);
  });

  it('keeps the thread and offers a retry for any other failure', async () => {
    vi.mocked(conversationsApi.transcript).mockRejectedValue(
      new ApiClientError('boom', 500)
    );

    const outcome = await useAgentStore
      .getState()
      .openConversation('c1', 'reload');

    const { conversationId, hydration } = useAgentStore.getState();
    expect([outcome, conversationId, hydration]).toEqual([
      'failed',
      'c1',
      'failed',
    ]);
  });

  it('does not refetch the thread already on screen', async () => {
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);
    await useAgentStore.getState().openConversation('c1', 'switcher');

    const again = await useAgentStore
      .getState()
      .openConversation('c1', 'switcher');

    expect(again).toBe('unchanged');
    expect(conversationsApi.transcript).toHaveBeenCalledTimes(1);
  });

  it('does not refetch a thread that is still loading', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const first = useAgentStore.getState().openConversation('c1', 'reload');

    const second = useAgentStore.getState().openConversation('c1', 'reload');
    pending.resolve(TRANSCRIPT);

    expect([await second, await first]).toEqual(['unchanged', 'opened']);
    expect(conversationsApi.transcript).toHaveBeenCalledTimes(1);
  });

  it('starts a different thread at the automatic effort', async () => {
    useAgentStore.getState().setReasoningEffort('high');
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);

    await useAgentStore.getState().openConversation('c1', 'switcher');

    expect(useAgentStore.getState().reasoningEffort).toBe('auto');
  });

  it('clears what hydration left on newConversation', async () => {
    vi.mocked(conversationsApi.transcript).mockResolvedValue(TRANSCRIPT);
    await useAgentStore.getState().openConversation('c1', 'switcher');

    useAgentStore.getState().newConversation();

    const { hydration, hasEarlier } = useAgentStore.getState();
    expect({ hydration, hasEarlier }).toEqual({
      hydration: 'unloaded',
      hasEarlier: false,
    });
  });
});

const GONE: AgentErrorPayload = {
  code: AGENT_CONVERSATION_NOT_FOUND_CODE,
  message: 'Conversation not found',
};

describe('agent.store sending into a conversation deleted elsewhere', () => {
  it('forgets the thread and gives the message back', () => {
    useAgentStore.setState({ conversationId: 'c1', conversationTitle: 'Old' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('¿Sigues ahí?');

    callbacks().onError(GONE);

    const state = useAgentStore.getState();
    expect({
      conversationId: state.conversationId,
      conversationTitle: state.conversationTitle,
      messages: state.messages,
      status: state.status,
      draft: state.draft,
      error: state.error,
    }).toEqual({
      conversationId: null,
      conversationTitle: null,
      messages: [],
      status: 'idle',
      draft: '¿Sigues ahí?',
      error: GONE,
    });
    expect(agentClient.resetConversation).toHaveBeenCalledTimes(1);
  });

  it('puts the returned message ahead of what the user typed since', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Primero');
    useAgentStore.getState().setDraft('Luego');

    callbacks().onError(GONE);

    expect(useAgentStore.getState().draft).toBe('Primero\n\nLuego');
  });

  it('keeps the queue for the next thread', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Uno');
    useAgentStore.getState().sendMessage('Dos');

    callbacks().onError(GONE);

    expect(useAgentStore.getState().queue.map((item) => item.text)).toEqual([
      'Dos',
    ]);
  });

  it('does not give back the text of a turn the user already decided on', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Crea la nota');
    callbacks().onProposal?.({
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 'Create',
      payload: {},
    });
    useAgentStore.getState().approveProposal();

    callbacks().onError(GONE);

    expect(useAgentStore.getState().draft).toBe('');
  });

  it('still shows any other failure in the dock', () => {
    useAgentStore.setState({ conversationId: 'c1' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('x');

    callbacks().onError({ code: 'AI_PROVIDER_ERROR', message: 'down' });

    const { status, conversationId } = useAgentStore.getState();
    expect({ status, conversationId }).toEqual({
      status: 'error',
      conversationId: 'c1',
    });
  });
});

function seedStoredConversation(state: unknown) {
  localStorage.setItem(
    COPILOT_CONVERSATION_STORAGE_KEY,
    JSON.stringify({ state, version: 0 })
  );
}

describe('agent.store restoring the stored conversation', () => {
  it('restores the user and the conversation it stored', async () => {
    seedStoredConversation({ userId: 'u1', conversationId: 'c1' });

    await useAgentStore.persist.rehydrate();

    const { userId, conversationId } = useAgentStore.getState();
    expect({ userId, conversationId }).toEqual({
      userId: 'u1',
      conversationId: 'c1',
    });
  });

  it('restores a user who had no conversation open', async () => {
    seedStoredConversation({ userId: 'u1', conversationId: null });

    await useAgentStore.persist.rehydrate();

    const { userId, conversationId } = useAgentStore.getState();
    expect({ userId, conversationId }).toEqual({
      userId: 'u1',
      conversationId: null,
    });
  });

  it.each([
    ['a numeric conversation id', { userId: 'u1', conversationId: 42 }],
    ['a missing owner', { conversationId: 'c1' }],
    ['a stored value that is not an object', 'c1'],
  ])('ignores %s', async (_label, stored) => {
    seedStoredConversation(stored);

    await useAgentStore.persist.rehydrate();

    const { userId, conversationId } = useAgentStore.getState();
    expect({ userId, conversationId }).toEqual({
      userId: null,
      conversationId: null,
    });
  });

  it('never restores state it did not store', async () => {
    seedStoredConversation({
      userId: 'u1',
      conversationId: 'c1',
      messages: 'oops',
      status: 'streaming',
    });

    await useAgentStore.persist.rehydrate();

    const { messages, status } = useAgentStore.getState();
    expect({ messages, status }).toEqual({ messages: [], status: 'idle' });
  });
});

describe('agent.store when the browser refuses storage', () => {
  beforeEach(() => {
    refuseStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still sends the message', () => {
    useAgentStore.getState().sendMessage('hola');

    expect(agentClient.sendMessage).toHaveBeenCalledWith(
      'hola',
      expect.any(Object),
      undefined,
      {}
    );
    expect(useAgentStore.getState().status).toBe('streaming');
  });
});

const LIVE_TURN_ID = 'turn-1';

function transcriptWith(
  ...turns: ConversationTranscript['messages']
): ConversationTranscript {
  return { ...TRANSCRIPT, messages: [...TRANSCRIPT.messages, ...turns] };
}

function row(
  turnId: string,
  role: 'user' | 'assistant',
  content: string
): ConversationTranscript['messages'][number] {
  return {
    turnId,
    role,
    content,
    sources: [],
    stopReason: role === 'assistant' ? 'completed' : null,
  };
}

async function openFailingThenSend(text: string) {
  vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
    new ApiClientError('boom', 500)
  );
  const opening = useAgentStore.getState().openConversation('c1', 'reload');
  const live = capture();
  useAgentStore.getState().sendMessage(text);
  expect(await opening).toBe('failed');
  return live;
}

describe('agent.store hydration by turn', () => {
  it('moves from unloaded to loading to loaded', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const seen = [useAgentStore.getState().hydration];

    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    seen.push(useAgentStore.getState().hydration);
    pending.resolve(TRANSCRIPT);
    await opening;
    seen.push(useAgentStore.getState().hydration);

    expect(seen).toEqual(['unloaded', 'loading', 'loaded']);
  });

  it('shows a turn sent while the thread loaded once when the transcript already holds it', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    callbacks().onChunk({ text: 'Day two.' });
    callbacks().onDone(DONE);

    pending.resolve(
      transcriptWith(
        row(LIVE_TURN_ID, 'user', 'new question'),
        row(LIVE_TURN_ID, 'assistant', 'Day two.')
      )
    );
    await opening;

    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Day two.',
    ]);
  });

  it('keeps streaming into the live bubble when the transcript holds part of the same turn', async () => {
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);
    const opening = useAgentStore.getState().openConversation('c1', 'reload');
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    callbacks().onChunk({ text: 'Day ' });

    pending.resolve(
      transcriptWith(
        row(LIVE_TURN_ID, 'user', 'new question'),
        row(LIVE_TURN_ID, 'assistant', 'stale')
      )
    );
    await opening;
    callbacks().onChunk({ text: 'two.' });
    callbacks().onDone(DONE);

    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Day two.',
    ]);
  });

  it('keeps the live turn and offers the retry when the fetch fails after a send', async () => {
    await openFailingThenSend('new question');

    const { hydration, status } = useAgentStore.getState();
    expect({ hydration, status, contents: contents() }).toEqual({
      hydration: 'failed',
      status: 'streaming',
      contents: ['new question', ''],
    });
  });

  it('shows the history on retry while the live turn keeps streaming', async () => {
    const { callbacks, cancel } = await openFailingThenSend('new question');
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);

    const retrying = useAgentStore.getState().retryHydration();
    const whileLoading = [useAgentStore.getState().hydration, contents()];
    pending.resolve(TRANSCRIPT);
    await retrying;
    callbacks().onChunk({ text: 'Day two.' });
    callbacks().onDone(DONE);

    expect(whileLoading).toEqual(['loading', ['new question', '']]);
    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Day two.',
    ]);
    expect(useAgentStore.getState().hydration).toBe('loaded');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps the messages and offers the retry again when the retry fails', async () => {
    await openFailingThenSend('new question');
    vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
      new ApiClientError('boom', 500)
    );

    await useAgentStore.getState().retryHydration();

    const { hydration, status } = useAgentStore.getState();
    expect({ hydration, status, contents: contents() }).toEqual({
      hydration: 'failed',
      status: 'streaming',
      contents: ['new question', ''],
    });
  });

  it('applies only the newest of two overlapping fetches', async () => {
    await openFailingThenSend('new question');
    const older = deferred<ConversationTranscript>();
    const newer = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const first = useAgentStore.getState().retryHydration();
    const second = useAgentStore.getState().retryHydration();

    newer.resolve({ ...TRANSCRIPT, title: 'Newer' });
    await second;
    older.resolve({ ...TRANSCRIPT, title: 'Older' });
    await first;

    expect(useAgentStore.getState().conversationTitle).toBe('Newer');
  });

  it('does nothing without a conversation to fetch', async () => {
    await useAgentStore.getState().retryHydration();

    expect(conversationsApi.transcript).not.toHaveBeenCalled();
    expect(useAgentStore.getState().hydration).toBe('unloaded');
  });

  it('ends a turn the server already settled with the answer it stored', async () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);

    callbacks().onConversation?.('c1');
    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });
    const whileLoading = useAgentStore.getState().status;
    pending.resolve(
      transcriptWith(
        row(LIVE_TURN_ID, 'user', 'new question'),
        row(LIVE_TURN_ID, 'assistant', 'Stored answer.')
      )
    );

    expect(whileLoading).toBe('streaming');
    await vi.waitFor(() =>
      expect(useAgentStore.getState().status).toBe('done')
    );
    expect(vi.mocked(conversationsApi.transcript).mock.calls).toEqual([
      ['c1', expect.any(AbortSignal)],
    ]);
    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Stored answer.',
    ]);
  });

  it('sends the queued message once the stored answer of the settled turn is shown', async () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('first');
    useAgentStore.getState().sendMessage('second');
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);

    callbacks().onConversation?.('c1');
    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });
    const sentBeforeTheAnswer = vi.mocked(agentClient.sendMessage).mock.calls
      .length;
    pending.resolve(transcriptWith(row(LIVE_TURN_ID, 'user', 'first')));

    await vi.waitFor(() =>
      expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[0]).toBe(
        'second'
      )
    );
    expect(sentBeforeTheAnswer).toBe(1);
  });

  it.each([
    ['a thread that had loaded', 'loaded' as const],
    ['a new conversation', 'unloaded' as const],
  ])(
    'keeps %s as it was and offers to reload the answer when the settled refetch fails',
    async (_label, hydration) => {
      useAgentStore.setState({ conversationId: 'c1', hydration });
      const { callbacks } = capture();
      useAgentStore.getState().sendMessage('new question');
      vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
        new ApiClientError('boom', 500)
      );

      callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });

      await vi.waitFor(() =>
        expect(useAgentStore.getState().status).toBe('error')
      );
      const state = useAgentStore.getState();
      expect({
        hydration: state.hydration,
        code: state.error?.code,
        retryMode: state.retryMode,
        contents: contents(),
      }).toEqual({
        hydration,
        code: 'AGENT_ANSWER_UNAVAILABLE',
        retryMode: 'reload',
        contents: ['new question'],
      });
    }
  );

  it('keeps a loaded thread loaded when the settled refetch finds the conversation gone', async () => {
    useAgentStore.setState({ conversationId: 'c1', hydration: 'loaded' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
      new ApiClientError('Conversation not found', 404)
    );

    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });

    await vi.waitFor(() =>
      expect(useAgentStore.getState().status).toBe('error')
    );
    expect(useAgentStore.getState().hydration).toBe('loaded');
  });

  it('gives up on a stored answer that never arrives and offers to reload it', async () => {
    vi.useFakeTimers();
    try {
      useAgentStore.setState({ conversationId: 'c1', hydration: 'loaded' });
      const { callbacks } = capture();
      useAgentStore.getState().sendMessage('new question');
      useAgentStore.getState().sendMessage('queued');
      vi.mocked(conversationsApi.transcript).mockImplementation(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new ApiClientError('Request was cancelled', 0, 'ABORTED'))
            );
          })
      );

      callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });
      await vi.advanceTimersByTimeAsync(AGENT_STREAM_INACTIVITY_MS);

      const state = useAgentStore.getState();
      expect({
        status: state.status,
        code: state.error?.code,
        retryMode: state.retryMode,
        hydration: state.hydration,
        contents: contents(),
        queue: state.queue.map((item) => item.text),
      }).toEqual({
        status: 'error',
        code: 'AGENT_ANSWER_UNAVAILABLE',
        retryMode: 'reload',
        hydration: 'loaded',
        contents: ['new question'],
        queue: ['queued'],
      });
      useAgentStore.getState().sendMessage('next');
      expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[0]).toBe(
        'next'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads the stored answer on retry instead of sending the message again', async () => {
    useAgentStore.setState({ conversationId: 'c1', hydration: 'loaded' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('new question');
    vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
      new ApiClientError('boom', 500)
    );
    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });
    await vi.waitFor(() =>
      expect(useAgentStore.getState().status).toBe('error')
    );
    vi.mocked(conversationsApi.transcript).mockResolvedValueOnce(
      transcriptWith(
        row(LIVE_TURN_ID, 'user', 'new question'),
        row(LIVE_TURN_ID, 'assistant', 'Stored answer.')
      )
    );

    useAgentStore.getState().retryLast();
    const whileReloading = [useAgentStore.getState().status, contents()];

    await vi.waitFor(() =>
      expect(useAgentStore.getState().status).toBe('done')
    );
    expect(whileReloading).toEqual(['streaming', ['new question', '']]);
    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'new question',
      'Stored answer.',
    ]);
    expect(agentClient.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps a loaded thread loaded when the refetch after a settled proposal fails', async () => {
    useAgentStore.setState({ conversationId: 'c1', hydration: 'loaded' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Crea la nota');
    callbacks().onProposal?.({
      turnId: LIVE_TURN_ID,
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 'Create',
      payload: {},
    });
    vi.mocked(conversationsApi.transcript).mockRejectedValueOnce(
      new ApiClientError('boom', 500)
    );

    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });

    await vi.waitFor(() =>
      expect(useAgentStore.getState().hydration).toBe('loaded')
    );
    expect(conversationsApi.transcript).toHaveBeenCalledTimes(1);
    expect(useAgentStore.getState().status).toBe('pendingProposal');
  });

  it('keeps the answer of a resumed leg that finished while the fetch was out', async () => {
    useAgentStore.setState({ conversationId: 'c1', hydration: 'loaded' });
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Crea la nota');
    callbacks().onChunk({ text: 'Before.' });
    callbacks().onProposal?.({
      turnId: LIVE_TURN_ID,
      id: 'p1',
      kind: 'create',
      targetNoteId: null,
      summary: 'Create',
      payload: {},
    });
    useAgentStore.getState().approveProposal();
    const pending = deferred<ConversationTranscript>();
    vi.mocked(conversationsApi.transcript).mockReturnValue(pending.promise);

    const retrying = useAgentStore.getState().retryHydration();
    callbacks().onChunk({ text: 'After.' });
    callbacks().onDone(DONE);
    pending.resolve(
      transcriptWith(
        row(LIVE_TURN_ID, 'user', 'Crea la nota'),
        row(LIVE_TURN_ID, 'assistant', 'Before.')
      )
    );
    await retrying;

    expect(contents()).toEqual([
      'Plan it',
      'Day one.',
      'Crea la nota',
      'Before.',
      'After.',
    ]);
  });

  it('keeps a proposal of the settled turn the user can still decide on', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('Crea la nota');
    const proposal = {
      turnId: LIVE_TURN_ID,
      id: 'p1',
      kind: 'create' as const,
      targetNoteId: null,
      summary: 'Create',
      payload: {},
    };
    callbacks().onProposal?.(proposal);
    vi.mocked(conversationsApi.transcript).mockReturnValue(
      deferred<ConversationTranscript>().promise
    );

    callbacks().onConversation?.('c1');
    callbacks().onTurnSettled({ turnId: LIVE_TURN_ID, conversationId: 'c1' });

    const { status, pendingProposal } = useAgentStore.getState();
    expect({ status, pendingProposal }).toEqual({
      status: 'pendingProposal',
      pendingProposal: proposal,
    });
    expect(conversationsApi.transcript).toHaveBeenCalledWith('c1', undefined);
  });
});

describe('agent.store retrying a failed turn', () => {
  afterEach(() => {
    vi.mocked(agentClient.canResendTurn).mockReset();
  });

  it('resends a turn whose outcome the client never learned under its own id', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');
    callbacks().onError({ code: 'CONNECTION_FAILED', message: 'down' });
    vi.mocked(agentClient.canResendTurn).mockImplementation(
      (turnId) => turnId === LIVE_TURN_ID
    );

    useAgentStore.getState().retryLast();

    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[3]).toEqual({
      turnId: LIVE_TURN_ID,
    });
    expect(useAgentStore.getState().messages.map((m) => m.turnId)).toEqual([
      LIVE_TURN_ID,
      LIVE_TURN_ID,
    ]);
  });

  it('retries a turn the server answered as a new turn', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');
    callbacks().onError({ code: 'AI_PROVIDER_ERROR', message: 'down' });

    useAgentStore.getState().retryLast();

    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[3]).toEqual({});
  });

  it('never gives a message the user sends a turn id of its own', () => {
    const { callbacks } = capture();
    useAgentStore.getState().sendMessage('hola');
    callbacks().onError({ code: 'CONNECTION_FAILED', message: 'down' });
    vi.mocked(agentClient.canResendTurn).mockReturnValue(true);

    useAgentStore.getState().sendMessage('hola');

    expect(vi.mocked(agentClient.sendMessage).mock.lastCall?.[3]).toEqual({});
  });
});
