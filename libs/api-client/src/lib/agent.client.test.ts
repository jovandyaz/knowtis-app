import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_TURN_ERROR_CODE } from '@knowtis/shared-types';

import { AgentClient } from './agent.client';
import type { RefreshOutcome } from './token-refresh-policy';

const emit = vi.fn();
const handlers = new Map<string, (payload: unknown) => void>();
const socket = {
  connected: true,
  emit,
  on: vi.fn((event: string, cb: (p: unknown) => void) => {
    handlers.set(event, cb);
  }),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}));

const { io } = await import('socket.io-client');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeSocket() {
  const fakeHandlers = new Map<string, (arg?: unknown) => void>();
  const fakeSocket = {
    connected: false,
    active: true,
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      fakeHandlers.set(event, cb);
      return fakeSocket;
    }),
    emit: vi.fn(() => fakeSocket),
    // socket.io marks a manually closed socket inactive before emitting
    // disconnect, and the client relies on that ordering.
    disconnect: vi.fn(() => {
      fakeSocket.connected = false;
      fakeSocket.active = false;
      fakeHandlers.get('disconnect')?.('io client disconnect');
      return fakeSocket;
    }),
  };
  return {
    socket: fakeSocket,
    trigger: (event: string, payload?: unknown) =>
      fakeHandlers.get(event)?.(payload),
  };
}

const AUTH_ERROR = {
  code: 'AUTH_REQUIRED',
  message: 'Authentication required',
};

/** The socket takes its token through an `auth` callback, so the value it would
 *  send is only observable by invoking that callback. */
function authTokenOf(ioCall: unknown[] | undefined): string | undefined {
  const options = ioCall?.[1] as
    | { auth?: (cb: (payload: { token: string }) => void) => void }
    | undefined;
  let token: string | undefined;
  options?.auth?.((payload) => {
    token = payload.token;
  });
  return token;
}

const PROPOSAL = {
  id: 'p1',
  kind: 'create' as const,
  targetNoteId: null,
  summary: 'Create "My Note"',
  payload: {},
};

function makeClient(): AgentClient {
  const client = new AgentClient('http://localhost:3333/agent');
  client.setTokenProvider({
    getAccessToken: () => 'token',
    clearTokens: () => {},
  });
  return client;
}

describe('AgentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    socket.connected = true;
  });

  afterEach(() => {
    handlers.clear();
  });

  it('emits agent:message with the message content on sendMessage', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'hi' },
      }),
      expect.any(Function)
    );
  });

  it('remembers conversationId from agent:done and sends it on the next message', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
      conversationId: 'c1',
    });
    emit.mockClear();
    client.sendMessage('again', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        conversationId: 'c1',
        message: { content: 'again' },
      }),
      expect.any(Function)
    );
  });

  it('adopts the conversation id announced mid-turn and sends it on the next message', () => {
    const client = makeClient();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.sendMessage('hi', callbacks);
    handlers.get('agent:conversation')?.({ conversationId: 'conv-1' });
    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
    });
    client.sendMessage('again', callbacks);
    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({ conversationId: 'conv-1' }),
      expect.any(Function)
    );
  });

  it('keeps the id of a first turn the user cancelled', () => {
    const client = makeClient();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    const handle = client.sendMessage('hi', callbacks);
    handlers.get('agent:conversation')?.({ conversationId: 'conv-1' });
    handle.cancel();
    client.sendMessage('again', callbacks);
    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({ conversationId: 'conv-1' }),
      expect.any(Function)
    );
  });

  it('ignores an announcement that arrives after the turn was cancelled', () => {
    const client = makeClient();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    const handle = client.sendMessage('hi', callbacks);
    handle.cancel();
    handlers.get('agent:conversation')?.({ conversationId: 'conv-late' });
    client.sendMessage('again', callbacks);
    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.not.objectContaining({ conversationId: expect.anything() }),
      expect.any(Function)
    );
  });

  it("does not re-attach a cancelled turn's thread when its agent:done lands late", () => {
    const client = makeClient();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    const handle = client.sendMessage('hi', callbacks);
    const receipt = emit.mock.calls.at(-1)?.[2] as (
      error: Error | null
    ) => void;
    receipt(null);
    handle.cancel();
    client.resetConversation();

    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
      conversationId: 'conv-late',
    });
    client.sendMessage('fresh', callbacks);

    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      { turnId: expect.any(String), message: { content: 'fresh' } },
      expect.any(Function)
    );
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it('resetConversation clears the remembered conversationId', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
      conversationId: 'c1',
    });
    client.resetConversation();
    emit.mockClear();
    client.sendMessage('fresh', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'fresh' },
      }),
      expect.any(Function)
    );
  });

  it('lets onDone start the next turn without cancelling it or losing its chunks', () => {
    const client = makeClient();
    const next = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.sendMessage('first', {
      onChunk: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onDone: () => {
        expect(client.canResume()).toBe(false);
        client.sendMessage('second', next);
      },
    });
    emit.mockClear();

    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
    });

    expect(emit).not.toHaveBeenCalledWith('agent:cancel');
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'second' },
      }),
      expect.any(Function)
    );
    handlers.get('agent:chunk')?.({ text: 'hi' });
    expect(next.onChunk).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('routes sources and the stop reason to onDone', () => {
    const client = makeClient();
    const onDone = vi.fn();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });

    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 2, model: 'm', costUsd: 0 },
      sources: [{ id: 'n1', title: 'Productividad' }],
      stopReason: 'token_budget',
    });

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [{ id: 'n1', title: 'Productividad' }],
        stopReason: 'token_budget',
      })
    );
  });

  it('emits agent:cancel when the handle of an acknowledged turn is cancelled', () => {
    const client = makeClient();
    const handle = client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    const receipt = emit.mock.calls.at(-1)?.at(-1) as (err: null) => void;
    receipt(null);
    handle.cancel();
    expect(emit).toHaveBeenCalledWith('agent:cancel');
  });

  it('includes the current noteId in agent:message when provided', () => {
    const client = makeClient();
    client.sendMessage(
      'hi',
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onTurnSettled: vi.fn(),
      },
      'note-123'
    );
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'hi' },
        noteId: 'note-123',
      }),
      expect.any(Function)
    );
  });

  it('includes the effort in agent:message when provided', () => {
    const client = makeClient();
    client.sendMessage(
      'hola',
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onTurnSettled: vi.fn(),
      },
      undefined,
      { effort: 'high' }
    );
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'hola' },
        effort: 'high',
      }),
      expect.any(Function)
    );
  });

  it('does not leak a previous effort into the next send', () => {
    const client = makeClient();
    client.sendMessage(
      'boost',
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onTurnSettled: vi.fn(),
      },
      undefined,
      { effort: 'high' }
    );
    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
    });
    emit.mockClear();
    client.sendMessage('plain', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'plain' },
      }),
      expect.any(Function)
    );
  });

  it('approve emits while the turn is still open', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    expect(client.canResume()).toBe(true);
    client.approve('p1');
    expect(emit).toHaveBeenCalledWith(
      'agent:approve',
      expect.objectContaining({
        proposalId: 'p1',
      }),
      expect.any(Function)
    );
  });

  it('approve does not emit once the request completed', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
    });
    emit.mockClear();
    expect(client.canResume()).toBe(false);
    client.approve('p1');
    expect(emit).not.toHaveBeenCalled();
  });

  it('reject does not emit after cancel cleared the pending request', () => {
    const client = makeClient();
    const handle = client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });
    handle.cancel();
    emit.mockClear();
    expect(client.canResume()).toBe(false);
    client.reject('p1', 'no');
    expect(emit).not.toHaveBeenCalled();
  });

  it('reports the conversation announced mid-turn', () => {
    const client = makeClient();
    const onConversation = vi.fn();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onConversation,
    });

    handlers.get('agent:conversation')?.({ conversationId: 'conv-1' });

    expect(onConversation).toHaveBeenCalledWith('conv-1');
  });

  it('reports the conversation carried by agent:done before the turn ends', () => {
    const client = makeClient();
    const order: string[] = [];
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onConversation: (id) => order.push(`conversation:${id}`),
      onDone: () => order.push('done'),
    });

    handlers.get('agent:done')?.({
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
      conversationId: 'conv-2',
    });

    expect(order).toEqual(['conversation:conv-2', 'done']);
  });

  it('does not report an announcement for a turn the user cancelled', () => {
    const client = makeClient();
    const onConversation = vi.fn();
    const handle = client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onConversation,
    });
    const receipt = emit.mock.calls.at(-1)?.[2] as (
      error: Error | null
    ) => void;
    receipt(null);
    handle.cancel();

    handlers.get('agent:conversation')?.({ conversationId: 'conv-late' });
    client.sendMessage('again', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });

    expect(onConversation).not.toHaveBeenCalled();
    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      { turnId: expect.any(String), message: { content: 'again' } },
      expect.any(Function)
    );
  });

  it('continues a resumed conversation on the next message', () => {
    const client = makeClient();
    client.resumeConversation('conv-9');

    client.sendMessage('again', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    });

    expect(emit).toHaveBeenLastCalledWith(
      'agent:message',
      {
        turnId: expect.any(String),
        conversationId: 'conv-9',
        message: { content: 'again' },
      },
      expect.any(Function)
    );
  });
});

describe('AgentClient – auth/transport failure paths', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls onError with AUTH_REQUIRED when no token and no refresh handler', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => null,
      clearTokens: vi.fn(),
    });

    client.sendMessage('hi', callbacks);
    await flush();

    expect(io).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
  });

  it('recovers from mid-stream AUTH_REQUIRED when refresh handler reports refreshed', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('hi', callbacks);
    await flush();
    expect(fake.socket.emit).toHaveBeenCalledTimes(1);

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'hi' },
      }),
      expect.any(Function)
    );
  });

  it('invokes session-expired handler and calls onError when auth refresh exhausted', async () => {
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => 'rejected');
    const onSessionExpired = vi.fn();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'stale-token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);
    client.setSessionExpiredHandler(onSessionExpired);

    client.sendMessage('hi', callbacks);
    await flush();

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('reports a connection failure without ending the session when the refresh is unavailable', async () => {
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => 'unavailable');
    const onSessionExpired = vi.fn();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'stale-token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);
    client.setSessionExpiredHandler(onSessionExpired);

    client.sendMessage('hi', callbacks);
    await flush();

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONNECTION_FAILED' })
    );
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('fails a proposal-suspended turn exactly once when the refresh after approval is unavailable', async () => {
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => 'unavailable');
    const onSessionExpired = vi.fn();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'stale-token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);
    client.setSessionExpiredHandler(onSessionExpired);

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    client.approve('p1');
    await flush();
    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONNECTION_FAILED' })
    );
    expect(onSessionExpired).not.toHaveBeenCalled();

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });

  it('fails the active request with CONNECTION_FAILED after maxReconnectAttempts connect_error events', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('hi', callbacks);
    await flush();

    for (let i = 0; i < 5; i++) {
      fake.trigger('connect_error', new Error('refused'));
    }

    expect(callbacks.onError).toHaveBeenCalledWith({
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to agent server',
    });
  });

  it('tears down the socket after exhausting reconnect attempts', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('hi', callbacks);
    await flush();

    for (let i = 0; i < 5; i++) {
      fake.trigger('connect_error', new Error('refused'));
    }

    expect(fake.socket.disconnect).toHaveBeenCalled();
  });

  it('opens a fresh socket for a turn sent after the server closed the previous one', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('first', callbacks);
    await flush();
    expect(io).toHaveBeenCalledTimes(1);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    client.sendMessage('second', callbacks);
    await flush();

    expect(io).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'second' },
      }),
      expect.any(Function)
    );
  });

  it('fails the in-flight turn when the server closes the connection', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('hi', callbacks);
    await flush();

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).toHaveBeenCalledWith({
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to agent server',
    });
  });

  it('keeps the in-flight turn alive while socket.io is reconnecting', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('hi', callbacks);
    await flush();

    fake.socket.connected = false;
    fake.socket.active = true;
    fake.trigger('disconnect', 'transport close');

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledTimes(1);

    fake.trigger('agent:chunk', { text: 'still here' });

    expect(callbacks.onChunk).toHaveBeenCalledWith({ text: 'still here' });
  });

  it('carries the turn sent while the token refresh was still in flight', async () => {
    let token: string | null = null;
    let releaseRefresh = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<RefreshOutcome>((resolve) => {
          releaseRefresh = () => {
            token = 'fresh-token';
            resolve('refreshed');
          };
        })
    );
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('first', callbacks);
    await flush();
    client.sendMessage('second', callbacks);
    await flush();

    releaseRefresh();
    await flush();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'second' },
      }),
      expect.any(Function)
    );
  });

  it('keeps a turn suspended on a proposal alive when the server closes the connection', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
  });

  it('approves over a fresh socket after the server closed the previous one', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');
    fake.socket.emit.mockClear();

    client.approve('p1');
    await flush();

    expect(io).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenCalledWith(
      'agent:approve',
      expect.objectContaining({
        proposalId: 'p1',
      }),
      expect.any(Function)
    );
  });

  it('rejects over a fresh socket after the server closed the previous one', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks, 'note-9');
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');
    fake.socket.emit.mockClear();

    client.reject('p1', 'too long');
    await flush();

    expect(fake.socket.emit).toHaveBeenCalledWith(
      'agent:reject',
      expect.objectContaining({
        proposalId: 'p1',
        noteId: 'note-9',
        reason: 'too long',
      }),
      expect.any(Function)
    );
  });

  it('omits reason from agent:reject when the caller gives none', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);
    fake.socket.emit.mockClear();

    client.reject('p1');
    await flush();

    expect(fake.socket.emit).toHaveBeenCalledWith(
      'agent:reject',
      expect.objectContaining({
        proposalId: 'p1',
      }),
      expect.any(Function)
    );
  });

  it('replays the decision, not the original message, after auth recovery', async () => {
    let token: string | null = 'stale-token';
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');
    token = null;
    fake.socket.emit.mockClear();

    client.approve('p1');
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenCalledTimes(1);
    expect(fake.socket.emit).toHaveBeenCalledWith(
      'agent:approve',
      expect.objectContaining({
        proposalId: 'p1',
      }),
      expect.any(Function)
    );
  });

  it('reports the turn as unresumable once it completed', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);
    fake.trigger('agent:done', {
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      stopReason: 'completed',
    });
    fake.socket.emit.mockClear();

    expect(client.canResume()).toBe(false);
    client.approve('p1');
    expect(fake.socket.emit).not.toHaveBeenCalled();
  });

  it('still fails a streaming turn when the server closes the connection', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);
    client.approve('p1');
    await flush();

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).toHaveBeenCalledWith({
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to agent server',
    });
  });

  it('lets auth recovery resume the turn the expiry disconnect interrupted', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('hi', callbacks);
    await flush();

    fake.trigger('agent:error', AUTH_ERROR);
    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');
    await flush();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenLastCalledWith(
      'agent:message',
      expect.objectContaining({
        message: { content: 'hi' },
      }),
      expect.any(Function)
    );
  });
  it('leaves a proposal awaiting its decision untouched when the token expires', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);
    fake.socket.emit.mockClear();

    fake.trigger('agent:error', AUTH_ERROR);
    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');
    await flush();

    expect(fake.socket.emit).not.toHaveBeenCalledWith(
      'agent:message',
      expect.anything(),
      expect.any(Function)
    );
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);

    client.approve('p1');
    await flush();

    expect(fake.socket.emit).toHaveBeenLastCalledWith(
      'agent:approve',
      expect.objectContaining({ proposalId: 'p1' }),
      expect.any(Function)
    );
    expect(authTokenOf(vi.mocked(io).mock.calls.at(-1))).toBe('fresh-token');
  });

  it('ignores a proposal arriving on a socket the client already replaced', async () => {
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.sendMessage('first', callbacks);
    await flush();
    const superseded = fake;
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client.sendMessage('second', callbacks);
    await flush();

    superseded.trigger('agent:proposal', PROPOSAL);

    expect(callbacks.onProposal).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
  });

  it('never re-runs the live turn when a replaced socket reports an auth error', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.sendMessage('first', callbacks);
    await flush();
    const superseded = fake;
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client.sendMessage('second', callbacks);
    await flush();
    fake.socket.emit.mockClear();

    superseded.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(refresh).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).not.toHaveBeenCalledWith(
      'agent:message',
      expect.anything(),
      expect.any(Function)
    );
  });

  it('ends the session when the refresh behind a pending decision is exhausted', async () => {
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => 'rejected');
    const sessionExpired = vi.fn();
    const callbacks = {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onTurnSettled: vi.fn(),
      onProposal: vi.fn(),
    };
    client.setTokenProvider({
      getAccessToken: () => 'stale-token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);
    client.setSessionExpiredHandler(sessionExpired);

    client.sendMessage('create a note', callbacks);
    await flush();
    fake.trigger('agent:proposal', PROPOSAL);

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
    expect(sessionExpired).toHaveBeenCalledTimes(1);
    expect(client.canResume()).toBe(false);
  });
});

describe('AgentClient – delivery receipts', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  const callbacksOf = () => ({
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onTurnSettled: vi.fn(),
  });
  const receiptOf = (call: unknown[] | undefined) =>
    call?.at(-1) as (err: Error | null) => void;
  const lastEmit = () => fake.socket.emit.mock.calls.at(-1) as unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
  });

  it('gives every emit a receipt deadline and never lets socket.io resend on its own', () => {
    client.sendMessage('hi', callbacksOf());

    expect(io).toHaveBeenCalledWith(
      'http://test.local/agent',
      expect.objectContaining({ ackTimeout: 10_000 })
    );
    expect(vi.mocked(io).mock.calls[0]?.[1]).not.toHaveProperty('retries');
  });

  it('keeps the turn open once the server acknowledges the message', () => {
    const callbacks = callbacksOf();
    client.sendMessage('hi', callbacks);

    receiptOf(lastEmit())(null);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
    expect(fake.socket.disconnect).not.toHaveBeenCalled();
  });

  it('fails the turn and drops the socket when the server never acknowledges the message', () => {
    const callbacks = callbacksOf();
    client.sendMessage('hi', callbacks);

    receiptOf(lastEmit())(new Error('operation has timed out'));

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONNECTION_FAILED' })
    );
    expect(client.canResume()).toBe(false);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores a late delivery failure of a superseded message', () => {
    const first = callbacksOf();
    const second = callbacksOf();
    client.sendMessage('one', first);
    const firstReceipt = receiptOf(lastEmit());
    client.sendMessage('two', second);

    firstReceipt(new Error('operation has timed out'));

    expect(first.onError).not.toHaveBeenCalled();
    expect(second.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('fails a proposal decision the server never acknowledges', () => {
    const callbacks = callbacksOf();
    client.sendMessage('hi', callbacks);
    fake.trigger('agent:proposal', PROPOSAL);
    client.approve('p1');
    expect(lastEmit()[0]).toBe('agent:approve');

    receiptOf(lastEmit())(new Error('operation has timed out'));

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONNECTION_FAILED' })
    );
    expect(client.canResume()).toBe(false);
  });
});

describe('AgentClient – abandoning an unacknowledged request', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  const callbacksOf = () => ({
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onTurnSettled: vi.fn(),
  });
  const receiptOf = (call: unknown[] | undefined) =>
    call?.at(-1) as (err: Error | null) => void;
  const lastEmit = () => fake.socket.emit.mock.calls.at(-1) as unknown[];
  const eventsEmitted = () =>
    (fake.socket.emit.mock.calls as unknown[][]).map((call) => call[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
  });

  it('cancels an acknowledged turn with agent:cancel and drops its socket', () => {
    const handle = client.sendMessage('one', callbacksOf());
    receiptOf(lastEmit())(null);

    handle.cancel();

    expect(eventsEmitted()).toEqual(['agent:message', 'agent:cancel']);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores a cancelled turn late agent:done and agent:chunk once a new turn is sent', () => {
    const handle = client.sendMessage('one', callbacksOf());
    receiptOf(lastEmit())(null);
    handle.cancel();

    const second = createFakeSocket();
    vi.mocked(io).mockReturnValue(second.socket as never);
    const b = callbacksOf();
    client.sendMessage('fresh', b);

    const sentMessage = (second.socket.emit.mock.calls as unknown[][]).find(
      (call) => call[0] === 'agent:message'
    );
    expect(sentMessage?.[1]).toEqual({
      turnId: expect.any(String),
      message: { content: 'fresh' },
    });

    fake.trigger('agent:done', {
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
      conversationId: 'stale-conversation',
    });
    fake.trigger('agent:chunk', { text: 'late chunk' });

    expect(b.onDone).not.toHaveBeenCalled();
    expect(b.onChunk).not.toHaveBeenCalled();
  });

  it('drops the socket instead of cancelling when the message was never acknowledged', () => {
    const first = callbacksOf();
    client.sendMessage('one', first);
    const second = createFakeSocket();
    vi.mocked(io).mockReturnValue(second.socket as never);

    client.sendMessage('two', callbacksOf());

    expect(eventsEmitted()).toEqual(['agent:message']);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(second.socket.emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({ message: { content: 'two' } }),
      expect.any(Function)
    );
    expect(first.onError).not.toHaveBeenCalled();
  });

  it('Stop on an unacknowledged message drops the socket without a cancel', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('one', callbacks);

    handle.cancel();

    expect(eventsEmitted()).toEqual(['agent:message']);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(false);
  });

  it('replays the request on a fresh socket when the refresh tears down one with an unacknowledged packet', async () => {
    const callbacks = callbacksOf();
    let token: string | null = 'stale';
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(async () => {
      token = 'fresh';
      return 'refreshed';
    });
    const fresh = createFakeSocket();
    vi.mocked(io)
      .mockReturnValueOnce(fake.socket as never)
      .mockReturnValue(fresh.socket as never);
    fake.socket.disconnect.mockImplementation(() => {
      receiptOf(lastEmit())(new Error('socket has been disconnected'));
      return fake.socket;
    });

    client.sendMessage('hi', callbacks);
    await flush();
    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(fresh.socket.emit).toHaveBeenCalledWith(
      'agent:message',
      expect.objectContaining({ message: { content: 'hi' } }),
      expect.any(Function)
    );
  });
});

describe('AgentClient – turn identity', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const FOREIGN_TURN_ID = '00000000-0000-4000-8000-000000000000';
  const RESEND_DELAYS_MS = [1_000, 2_000, 4_000];
  const DONE = {
    usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: 'completed',
  };

  const callbacksOf = () => ({
    onChunk: vi.fn(),
    onThinking: vi.fn(),
    onDone: vi.fn(),
    onConversation: vi.fn(),
    onError: vi.fn(),
    onProposal: vi.fn(),
    onCommitted: vi.fn(),
    onTurnSettled: vi.fn(),
  });
  const sentMessages = () =>
    (fake.socket.emit.mock.calls as unknown[][])
      .filter((call) => call[0] === 'agent:message')
      .map((call) => call[1] as { turnId?: string });
  const sentTurnIds = () => sentMessages().map((message) => message.turnId);
  const lastMessage = () => sentMessages().at(-1);
  const turnError = (
    code: (typeof AGENT_TURN_ERROR_CODE)[keyof typeof AGENT_TURN_ERROR_CODE],
    turnId: string
  ) => ({ code, message: code, turnId });

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a fresh uuid turn id with every message and exposes it on the handle', () => {
    const first = client.sendMessage('one', callbacksOf());
    fake.trigger('agent:done', { ...DONE, turnId: first.turnId });
    const second = client.sendMessage('two', callbacksOf());

    expect(first.turnId).toMatch(UUID);
    expect(second.turnId).toMatch(UUID);
    expect(second.turnId).not.toBe(first.turnId);
    expect(sentTurnIds()).toEqual([first.turnId, second.turnId]);
  });

  it('replays the same turn id after an auth refresh', async () => {
    let token = 'stale-token';
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(async () => {
      token = 'fresh-token';
      return 'refreshed';
    });

    const handle = client.sendMessage('hi', callbacksOf());
    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(sentTurnIds()).toEqual([handle.turnId, handle.turnId]);
  });

  it('delivers events of the active turn and events that name no turn', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);

    fake.trigger('agent:chunk', { turnId: handle.turnId, text: 'mine' });
    fake.trigger('agent:chunk', { text: 'unnamed' });

    expect(callbacks.onChunk.mock.calls).toEqual([
      [{ turnId: handle.turnId, text: 'mine' }],
      [{ text: 'unnamed' }],
    ]);
  });

  it.each([
    ['agent:chunk', { text: 'x' }, 'onChunk'],
    ['agent:thinking', { text: 'x' }, 'onThinking'],
    ['agent:conversation', { conversationId: 'conv-x' }, 'onConversation'],
    ['agent:done', DONE, 'onDone'],
    ['agent:error', { code: 'AI_ERROR', message: 'x' }, 'onError'],
    ['agent:proposal', PROPOSAL, 'onProposal'],
    [
      'agent:committed',
      {
        proposalId: 'p1',
        result: { noteId: 'n1', title: 'T', kind: 'create' },
      },
      'onCommitted',
    ],
    ['agent:turn_settled', { conversationId: 'conv-x' }, 'onTurnSettled'],
  ] as const)('drops %s of another turn', (event, payload, callback) => {
    const callbacks = callbacksOf();
    client.sendMessage('hi', callbacks);

    fake.trigger(event, { ...payload, turnId: FOREIGN_TURN_ID });

    expect(callbacks[callback]).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
  });

  it('drops a late error of the previous turn on the socket the next turn reuses', () => {
    const first = client.sendMessage('one', callbacksOf());
    fake.trigger('agent:done', { ...DONE, turnId: first.turnId });
    const next = callbacksOf();
    client.sendMessage('two', next);

    fake.trigger('agent:error', {
      code: 'AI_ERROR',
      message: 'late',
      turnId: first.turnId,
    });

    expect(io).toHaveBeenCalledTimes(1);
    expect(next.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
  });

  it('ends a turn the server already settled through onTurnSettled', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);

    fake.trigger('agent:turn_settled', {
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });

    expect(callbacks.onConversation).toHaveBeenCalledWith('conv-7');
    expect(callbacks.onTurnSettled).toHaveBeenCalledWith({
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(false);
  });

  it('ignores replies of a settled turn that arrive after it', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    fake.trigger('agent:turn_settled', {
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });

    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, handle.turnId)
    );
    fake.trigger('agent:done', { ...DONE, turnId: handle.turnId });

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onTurnSettled).toHaveBeenCalledTimes(1);
  });

  it('continues the settled conversation on the next message', () => {
    const handle = client.sendMessage('hi', callbacksOf());
    fake.trigger('agent:turn_settled', {
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });

    client.sendMessage('again', callbacksOf());

    expect(lastMessage()).toEqual(
      expect.objectContaining({ conversationId: 'conv-7' })
    );
  });

  it('resends a turn still in progress with the same id after 1 s, 2 s and 4 s, then fails it', () => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    const inProgress = turnError(
      AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS,
      handle.turnId
    );

    for (const [attempt, delay] of RESEND_DELAYS_MS.entries()) {
      fake.trigger('agent:error', inProgress);
      vi.advanceTimersByTime(delay - 1);
      expect(sentTurnIds()).toHaveLength(attempt + 1);
      vi.advanceTimersByTime(1);
      expect(sentTurnIds()).toHaveLength(attempt + 2);
    }
    expect(callbacks.onError).not.toHaveBeenCalled();

    fake.trigger('agent:error', inProgress);

    expect(callbacks.onError).toHaveBeenCalledWith(inProgress);
    expect(client.canResume()).toBe(false);
    vi.runAllTimers();
    expect(sentTurnIds()).toEqual([
      handle.turnId,
      handle.turnId,
      handle.turnId,
      handle.turnId,
    ]);
  });

  it('resends a turn whose claim was unavailable and streams the resend', () => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks, 'note-1', {
      effort: 'high',
    });

    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE, handle.turnId)
    );
    vi.advanceTimersByTime(1_000);
    fake.trigger('agent:chunk', { turnId: handle.turnId, text: 'hello' });

    expect(sentTurnIds()).toEqual([handle.turnId, handle.turnId]);
    expect(lastMessage()).toEqual({
      turnId: handle.turnId,
      message: { content: 'hi' },
      noteId: 'note-1',
      effort: 'high',
    });
    expect(callbacks.onChunk).toHaveBeenCalledWith({
      turnId: handle.turnId,
      text: 'hello',
    });
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('fails a turn whose id was reused without resending it', () => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    const reused = turnError(
      AGENT_TURN_ERROR_CODE.TURN_ID_REUSED,
      handle.turnId
    );

    fake.trigger('agent:error', reused);
    vi.runAllTimers();

    expect(callbacks.onError).toHaveBeenCalledWith(reused);
    expect(sentTurnIds()).toEqual([handle.turnId]);
  });

  it('drops the pending resend when the turn is cancelled during the wait', () => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, handle.turnId)
    );

    handle.cancel();

    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(sentTurnIds()).toEqual([handle.turnId]);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('lets the auth replay replace a resend scheduled before the token expired', async () => {
    vi.useFakeTimers();
    let token = 'stale-token';
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(async () => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, handle.turnId)
    );

    fake.trigger('agent:error', AUTH_ERROR);
    await vi.runAllTimersAsync();

    expect(io).toHaveBeenCalledTimes(2);
    expect(sentTurnIds()).toEqual([handle.turnId, handle.turnId]);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('sends no resend once the turn proposes during the wait', () => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('create a note', callbacks);
    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, handle.turnId)
    );

    fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });

    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(sentTurnIds()).toEqual([handle.turnId]);
    expect(callbacks.onProposal).toHaveBeenCalledTimes(1);
    expect(client.canResume()).toBe(true);
  });

  it('resends the body frozen at send time even after the turn announced its conversation', () => {
    vi.useFakeTimers();
    const handle = client.sendMessage('hi', callbacksOf(), 'note-1', {
      effort: 'high',
    });
    fake.trigger('agent:conversation', {
      turnId: handle.turnId,
      conversationId: 'conv-derived',
    });

    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, handle.turnId)
    );
    vi.advanceTimersByTime(1_000);

    const [first, resent] = sentMessages();
    expect(first).toEqual({
      turnId: handle.turnId,
      message: { content: 'hi' },
      noteId: 'note-1',
      effort: 'high',
    });
    expect(resent).toEqual(first);
  });

  it('replays the body frozen at send time after an auth refresh, even after the turn announced its conversation', async () => {
    let token = 'stale-token';
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(async () => {
      token = 'fresh-token';
      return 'refreshed';
    });
    const handle = client.sendMessage('hi', callbacksOf());
    fake.trigger('agent:conversation', {
      turnId: handle.turnId,
      conversationId: 'conv-derived',
    });

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    const [first, replayed] = sentMessages();
    expect(first).toEqual({
      turnId: handle.turnId,
      message: { content: 'hi' },
    });
    expect(replayed).toEqual(first);
  });

  it('gives each new turn the whole backoff again', () => {
    vi.useFakeTimers();
    const first = client.sendMessage('one', callbacksOf());
    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, first.turnId)
    );
    vi.advanceTimersByTime(1_000);
    fake.trigger('agent:done', { ...DONE, turnId: first.turnId });

    const second = client.sendMessage('two', callbacksOf());
    fake.trigger(
      'agent:error',
      turnError(AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS, second.turnId)
    );
    vi.advanceTimersByTime(1_000);

    expect(sentTurnIds()).toEqual([
      first.turnId,
      first.turnId,
      second.turnId,
      second.turnId,
    ]);
  });

  it.each(['approve', 'reject'] as const)(
    'streams the turn resumed by %s under the proposing turn id and drops other turns',
    (decision) => {
      const callbacks = callbacksOf();
      const handle = client.sendMessage('create a note', callbacks);
      fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });

      client[decision]('p1');
      fake.trigger('agent:chunk', { turnId: handle.turnId, text: 'resumed' });
      fake.trigger('agent:chunk', { turnId: FOREIGN_TURN_ID, text: 'other' });
      fake.trigger('agent:done', { ...DONE, turnId: handle.turnId });

      expect(callbacks.onProposal).toHaveBeenCalledTimes(1);
      expect(callbacks.onChunk.mock.calls).toEqual([
        [{ turnId: handle.turnId, text: 'resumed' }],
      ]);
      expect(callbacks.onDone).toHaveBeenCalledTimes(1);
      expect(client.canResume()).toBe(false);
    }
  );

  it('keeps the proposing turn id on the fresh socket a decision opens', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('create a note', callbacks);
    fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });
    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    client.approve('p1');
    fake.trigger('agent:committed', {
      turnId: handle.turnId,
      proposalId: 'p1',
      result: { noteId: 'n1', title: 'T', kind: 'create' },
    });
    fake.trigger('agent:chunk', { turnId: handle.turnId, text: 'resumed' });

    expect(io).toHaveBeenCalledTimes(2);
    expect(callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(callbacks.onChunk).toHaveBeenCalledWith({
      turnId: handle.turnId,
      text: 'resumed',
    });
  });

  it.each(['approve', 'reject'] as const)(
    'fails the %s decision the server reports in progress without resending anything',
    (decision) => {
      vi.useFakeTimers();
      const callbacks = callbacksOf();
      const handle = client.sendMessage('create a note', callbacks);
      fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });
      client[decision]('p1');
      const inProgress = turnError(
        AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS,
        handle.turnId
      );

      fake.trigger('agent:error', inProgress);
      vi.runAllTimers();

      expect(callbacks.onError).toHaveBeenCalledWith(inProgress);
      expect(client.canResume()).toBe(false);
      expect(
        (fake.socket.emit.mock.calls as unknown[][]).map((call) => call[0])
      ).toEqual(['agent:message', `agent:${decision}`]);
    }
  );
});

describe('AgentClient – resending a failed turn', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  const RESENT_TURN_ID = '11111111-1111-4111-8111-111111111111';
  const LAST_RESEND_DELAY_MS = 4_000;
  const callbacksOf = () => ({
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onConversation: vi.fn(),
    onError: vi.fn(),
    onProposal: vi.fn(),
    onTurnSettled: vi.fn(),
  });
  const receiptOf = (call: unknown[] | undefined) =>
    call?.at(-1) as (err: Error | null) => void;
  const lastEmit = () => fake.socket.emit.mock.calls.at(-1) as unknown[];
  const sentTurnIds = () =>
    (fake.socket.emit.mock.calls as unknown[][])
      .filter((call) => call[0] === 'agent:message')
      .map((call) => (call[1] as { turnId: string }).turnId);

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the turn id the caller resends instead of minting one', () => {
    const handle = client.sendMessage('hi', callbacksOf(), undefined, {
      turnId: RESENT_TURN_ID,
    });

    expect(handle.turnId).toBe(RESENT_TURN_ID);
    expect(sentTurnIds()).toEqual([RESENT_TURN_ID]);
  });

  it('offers a turn for a resend when its message was never acknowledged', () => {
    const handle = client.sendMessage('hi', callbacksOf());

    receiptOf(lastEmit())(new Error('operation has timed out'));

    expect(client.canResendTurn(handle.turnId)).toBe(true);
  });

  it.each([
    AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS,
    AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
  ])('offers a turn for a resend when %s outlasts the backoff', (code) => {
    vi.useFakeTimers();
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    receiptOf(lastEmit())(null);
    const refused = { code, message: code, turnId: handle.turnId };

    for (let attempt = 0; attempt < 3; attempt++) {
      fake.trigger('agent:error', refused);
      vi.advanceTimersByTime(LAST_RESEND_DELAY_MS);
      receiptOf(lastEmit())(null);
    }
    fake.trigger('agent:error', refused);

    expect(callbacks.onError).toHaveBeenCalledWith(refused);
    expect(client.canResendTurn(handle.turnId)).toBe(true);
  });

  it('does not offer a turn the server acknowledged and then failed', () => {
    const handle = client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(null);

    fake.trigger('agent:error', {
      code: 'AI_PROVIDER_ERROR',
      message: 'down',
      turnId: handle.turnId,
    });

    expect(client.canResendTurn(handle.turnId)).toBe(false);
  });

  it('offers a turn whose socket closed before the server reported its end', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('hi', callbacks);
    receiptOf(lastEmit())(null);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONNECTION_FAILED' })
    );
    expect(client.canResendTurn(handle.turnId)).toBe(true);
  });

  it('offers a turn the caller cancelled before the server reported its end', () => {
    const handle = client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(null);

    handle.cancel();

    expect(client.canResendTurn(handle.turnId)).toBe(true);
  });

  it.each([
    ['finished', 'agent:done'],
    ['settled', 'agent:turn_settled'],
  ])('does not offer a turn the server reported %s', (_label, event) => {
    const handle = client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(null);

    fake.trigger(event, {
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });

    expect(client.canResendTurn(handle.turnId)).toBe(false);
  });

  it('does not offer a turn whose proposal decision was never acknowledged', () => {
    const handle = client.sendMessage('create a note', callbacksOf());
    receiptOf(lastEmit())(null);
    fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });
    client.approve('p1');

    receiptOf(lastEmit())(new Error('operation has timed out'));

    expect(client.canResendTurn(handle.turnId)).toBe(false);
  });

  it('forgets the failed turn once the next message goes out', () => {
    const failed = client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(new Error('operation has timed out'));

    client.sendMessage('something else', callbacksOf());

    expect(client.canResendTurn(failed.turnId)).toBe(false);
  });

  it.each([
    ['a new conversation', (c: AgentClient) => c.resetConversation()],
    ['another conversation', (c: AgentClient) => c.resumeConversation('c2')],
  ])('forgets the failed turn when the user moves to %s', (_label, move) => {
    const failed = client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(new Error('operation has timed out'));

    move(client);

    expect(client.canResendTurn(failed.turnId)).toBe(false);
  });

  it('keeps a turn suspended on its proposal open for the decision when a reply reports it settled', () => {
    const callbacks = callbacksOf();
    const handle = client.sendMessage('create a note', callbacks);
    receiptOf(lastEmit())(null);
    fake.trigger('agent:proposal', { ...PROPOSAL, turnId: handle.turnId });

    fake.trigger('agent:turn_settled', {
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });
    client.approve('p1');

    expect(callbacks.onTurnSettled).toHaveBeenCalledWith({
      turnId: handle.turnId,
      conversationId: 'conv-7',
    });
    expect(lastEmit()[0]).toBe('agent:approve');
  });
});

describe('AgentClient – resending a turn after the transport drops', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AgentClient;

  const callbacksOf = () => ({
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onProposal: vi.fn(),
    onTurnSettled: vi.fn(),
  });
  const receiptOf = (call: unknown[] | undefined) =>
    call?.at(-1) as (err: Error | null) => void;
  const lastEmit = () => fake.socket.emit.mock.calls.at(-1) as unknown[];
  const sentMessages = () =>
    (fake.socket.emit.mock.calls as unknown[][])
      .filter((call) => call[0] === 'agent:message')
      .map((call) => call[1]);
  const dropAndReconnect = () => {
    fake.socket.connected = false;
    fake.trigger('disconnect', 'transport close');
    fake.socket.connected = true;
    fake.trigger('connect');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AgentClient('http://test.local/agent');
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
  });

  it('resends an acknowledged turn once, with its frozen body, when the socket reconnects', () => {
    const callbacks = callbacksOf();
    client.sendMessage('hi', callbacks, 'note-1', { effort: 'high' });
    receiptOf(lastEmit())(null);

    dropAndReconnect();
    receiptOf(lastEmit())(null);
    dropAndReconnect();

    const [first, ...resent] = sentMessages();
    expect(resent).toEqual([first]);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(client.canResume()).toBe(true);
  });

  it('leaves an unacknowledged message to its receipt deadline', () => {
    client.sendMessage('hi', callbacksOf());

    dropAndReconnect();

    expect(sentMessages()).toHaveLength(1);
  });

  it('never resends a proposal decision on reconnect', () => {
    client.sendMessage('create a note', callbacksOf());
    receiptOf(lastEmit())(null);
    fake.trigger('agent:proposal', PROPOSAL);
    client.approve('p1');
    receiptOf(lastEmit())(null);

    dropAndReconnect();

    expect(
      (fake.socket.emit.mock.calls as unknown[][]).map((call) => call[0])
    ).toEqual(['agent:message', 'agent:approve']);
  });

  it('resends nothing for a turn that already ended', () => {
    client.sendMessage('hi', callbacksOf());
    receiptOf(lastEmit())(null);
    fake.trigger('agent:done', {
      usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed',
    });

    dropAndReconnect();

    expect(sentMessages()).toHaveLength(1);
  });
});
