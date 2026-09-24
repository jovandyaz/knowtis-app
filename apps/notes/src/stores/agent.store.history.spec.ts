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
} from '@knowtis/api-client';
import { conversationsQueryKeys } from '@knowtis/data-access-agent';
import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  type ConversationTranscript,
} from '@knowtis/shared-types';
import { COPILOT_CONVERSATION_STORAGE_KEY } from '@knowtis/shared-util';

import { useAgentStore } from './agent.store';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
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
      { id: expect.any(String), role: 'user', content: 'Plan it' },
      {
        id: expect.any(String),
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
    ]).toEqual(['Trip', true, 'idle']);
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
      hydration: 'idle',
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
      'idle',
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
      hydration: 'idle',
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
      undefined
    );
    expect(useAgentStore.getState().status).toBe('streaming');
  });
});
