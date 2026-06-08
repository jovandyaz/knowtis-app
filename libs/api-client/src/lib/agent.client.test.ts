import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentClient } from './agent.client';
import type { AgentWireMessage } from './agent.client';

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
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      fakeHandlers.set(event, cb);
      return fakeSocket;
    }),
    emit: vi.fn(() => fakeSocket),
    disconnect: vi.fn(() => {
      fakeSocket.connected = false;
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

const MESSAGES: AgentWireMessage[] = [{ role: 'user', content: 'hi' }];

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

  it('emits agent:message with the conversation on sendMessage', () => {
    const client = makeClient();
    client.sendMessage(MESSAGES, {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(emit).toHaveBeenCalledWith('agent:message', { messages: MESSAGES });
  });

  it('routes usage and sources to onDone', () => {
    const client = makeClient();
    const onDone = vi.fn();
    client.sendMessage(MESSAGES, {
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
    const handle = client.sendMessage(MESSAGES, {
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
      MESSAGES,
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      'note-123'
    );
    expect(emit).toHaveBeenCalledWith('agent:message', {
      messages: MESSAGES,
      noteId: 'note-123',
    });
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

    client.sendMessage(MESSAGES, callbacks);
    await flush();

    expect(io).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
  });

  it('recovers from mid-stream AUTH_REQUIRED when refresh handler resolves true', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async () => {
      token = 'fresh-token';
      return true;
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

    client.sendMessage(MESSAGES, callbacks);
    await flush();
    expect(fake.socket.emit).toHaveBeenCalledTimes(1);

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenLastCalledWith('agent:message', {
      messages: MESSAGES,
    });
  });

  it('invokes session-expired handler and calls onError when auth refresh exhausted', async () => {
    const refresh = vi.fn(async () => false);
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

    client.sendMessage(MESSAGES, callbacks);
    await flush();

    fake.trigger('agent:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
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

    client.sendMessage(MESSAGES, callbacks);
    await flush();

    for (let i = 0; i < 5; i++) {
      fake.trigger('connect_error', new Error('refused'));
    }

    expect(callbacks.onError).toHaveBeenCalledWith({
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to agent server',
    });
  });
});
