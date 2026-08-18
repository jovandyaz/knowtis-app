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
    expect(emit).toHaveBeenCalledWith('agent:message', {
      message: { content: 'hi' },
    });
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
      conversationId: 'c1',
    });
    emit.mockClear();
    client.sendMessage('again', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith('agent:message', {
      conversationId: 'c1',
      message: { content: 'again' },
    });
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
      conversationId: 'c1',
    });
    client.resetConversation();
    emit.mockClear();
    client.sendMessage('fresh', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith('agent:message', {
      message: { content: 'fresh' },
    });
  });

  it('routes usage and sources to onDone', () => {
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
    });

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [{ id: 'n1', title: 'Productividad' }],
      })
    );
  });

  it('emits agent:cancel when the handle is cancelled', () => {
    const client = makeClient();
    const handle = client.sendMessage('hi', {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
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
    expect(emit).toHaveBeenCalledWith('agent:message', {
      message: { content: 'hi' },
      noteId: 'note-123',
    });
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
    expect(emit).toHaveBeenCalledWith('agent:approve', {
      proposalId: 'p1',
    });
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
    expect(fake.socket.emit).toHaveBeenLastCalledWith('agent:message', {
      message: { content: 'hi' },
    });
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
    expect(fake.socket.emit).toHaveBeenLastCalledWith('agent:message', {
      message: { content: 'second' },
    });
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
    expect(fake.socket.emit).toHaveBeenLastCalledWith('agent:message', {
      message: { content: 'second' },
    });
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
    expect(fake.socket.emit).toHaveBeenCalledWith('agent:approve', {
      proposalId: 'p1',
    });
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

    expect(fake.socket.emit).toHaveBeenCalledWith('agent:reject', {
      proposalId: 'p1',
      noteId: 'note-9',
      reason: 'too long',
    });
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

    expect(fake.socket.emit).toHaveBeenCalledWith('agent:reject', {
      proposalId: 'p1',
    });
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
    expect(fake.socket.emit).toHaveBeenCalledWith('agent:approve', {
      proposalId: 'p1',
    });
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
    expect(fake.socket.emit).toHaveBeenLastCalledWith('agent:message', {
      message: { content: 'hi' },
    });
  });
});
