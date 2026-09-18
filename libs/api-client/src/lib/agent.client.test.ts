import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    // Mirrors socket.io: a manual disconnect emits the event with the socket inactive.
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
  previewHtml: null,
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
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
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
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
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
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
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

  it('resetConversation clears the remembered conversationId', () => {
    const client = makeClient();
    client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
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
    const next = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    client.sendMessage('first', {
      onChunk: vi.fn(),
      onError: vi.fn(),
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
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
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
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
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
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
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
    });
    handle.cancel();
    emit.mockClear();
    expect(client.canResume()).toBe(false);
    client.reject('p1', 'no');
    expect(emit).not.toHaveBeenCalled();
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

  it('cancels an acknowledged turn with agent:cancel and keeps its socket', () => {
    const handle = client.sendMessage('one', callbacksOf());
    receiptOf(lastEmit())(null);

    handle.cancel();

    expect(eventsEmitted()).toEqual(['agent:message', 'agent:cancel']);
    expect(fake.socket.disconnect).not.toHaveBeenCalled();
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
