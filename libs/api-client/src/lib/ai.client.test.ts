import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIAction } from '@knowtis/shared-types';

import { AIClient, type AICompletePayload } from './ai.client';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const { io } = await import('socket.io-client');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeSocket() {
  const handlers = new Map<string, (arg?: unknown) => void>();
  const socket = {
    connected: false,
    active: true,
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      handlers.set(event, cb);
      return socket;
    }),
    emit: vi.fn(() => socket),
    // Mirrors socket.io: a manual disconnect emits the event with the socket inactive.
    disconnect: vi.fn(() => {
      socket.connected = false;
      socket.active = false;
      handlers.get('disconnect')?.('io client disconnect');
      return socket;
    }),
  };
  return {
    socket,
    trigger: (event: string, payload?: unknown) =>
      handlers.get(event)?.(payload),
  };
}

function createCallbacks() {
  return {
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

const PAYLOAD: AICompletePayload = {
  action: 'summarize' as AIAction,
  content: 'hello world',
};

const AUTH_ERROR = {
  code: 'AUTH_REQUIRED',
  message: 'Authentication required',
};

describe('AIClient', () => {
  let fake: ReturnType<typeof createFakeSocket>;
  let client: AIClient;

  beforeEach(() => {
    fake = createFakeSocket();
    vi.mocked(io).mockReturnValue(fake.socket as never);
    client = new AIClient('http://test.local/ai');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits ai:complete when a token is already available', async () => {
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, createCallbacks());
    await flush();

    expect(io).toHaveBeenCalledTimes(1);
    expect(fake.socket.emit).toHaveBeenCalledWith('ai:complete', PAYLOAD);
  });

  it('refreshes the token before connecting when none is available', async () => {
    let token: string | null = null;
    const refresh = vi.fn(async () => {
      token = 'fresh-token';
      return true;
    });
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.stream(PAYLOAD, createCallbacks());
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fake.socket.emit).toHaveBeenCalledWith('ai:complete', PAYLOAD);

    const authFn = vi.mocked(io).mock.calls[0]?.[1]?.auth as (
      cb: (data: object) => void
    ) => void;
    const authCb = vi.fn();
    authFn(authCb);
    expect(authCb).toHaveBeenCalledWith({ token: 'fresh-token' });
  });

  it('surfaces an auth error when no refresh handler is configured', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => null,
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    expect(io).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
  });

  it('recovers from AUTH_REQUIRED by refreshing and re-emitting the request', async () => {
    let token = 'stale-token';
    const refresh = vi.fn(async () => {
      token = 'fresh-token';
      return true;
    });
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => token,
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.stream(PAYLOAD, callbacks);
    await flush();
    expect(fake.socket.emit).toHaveBeenCalledTimes(1);

    fake.trigger('ai:error', AUTH_ERROR);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(fake.socket.emit).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenLastCalledWith('ai:complete', PAYLOAD);
  });

  it('fails terminally and signals session expiry when refresh fails', async () => {
    const refresh = vi.fn(async () => false);
    const onSessionExpired = vi.fn();
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'stale-token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);
    client.setSessionExpiredHandler(onSessionExpired);

    client.stream(PAYLOAD, callbacks);
    await flush();

    fake.trigger('ai:error', AUTH_ERROR);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not loop: a second AUTH_REQUIRED after recovery forwards the error', async () => {
    const refresh = vi.fn(async () => true);
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });
    client.setAuthRefreshHandler(refresh);

    client.stream(PAYLOAD, callbacks);
    await flush();

    fake.trigger('ai:error', AUTH_ERROR);
    await flush();
    fake.trigger('ai:error', AUTH_ERROR);
    await flush();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).toHaveBeenCalledWith(AUTH_ERROR);
  });

  it('forwards non-auth errors directly to the caller', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    const providerError = { code: 'AI_PROVIDER_ERROR', message: 'boom' };
    fake.trigger('ai:error', providerError);

    expect(callbacks.onError).toHaveBeenCalledWith(providerError);
  });

  it('streams chunks and completes', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    fake.trigger('ai:chunk', { text: 'partial' });
    const usage = {
      inputTokens: 1,
      outputTokens: 2,
      model: 'm',
      costUsd: 0,
    };
    fake.trigger('ai:done', { usage });

    expect(callbacks.onChunk).toHaveBeenCalledWith({ text: 'partial' });
    expect(callbacks.onDone).toHaveBeenCalledWith({ usage });
  });

  it('tears down the socket after exhausting reconnect attempts', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    for (let i = 0; i < 5; i++) {
      fake.trigger('connect_error', new Error('refused'));
    }

    expect(callbacks.onError).toHaveBeenCalled();
    expect(fake.socket.disconnect).toHaveBeenCalled();
  });

  it('opens a fresh socket for a request sent after the server closed the previous one', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();
    expect(io).toHaveBeenCalledTimes(1);

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    client.stream(PAYLOAD, createCallbacks());
    await flush();

    expect(io).toHaveBeenCalledTimes(2);
    expect(fake.socket.emit).toHaveBeenLastCalledWith('ai:complete', PAYLOAD);
  });

  it('fails the in-flight request when the server closes the connection', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    fake.socket.connected = false;
    fake.socket.active = false;
    fake.trigger('disconnect', 'io server disconnect');

    expect(callbacks.onError).toHaveBeenCalledWith({
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to AI server',
    });
  });

  it('keeps the in-flight request alive while socket.io is reconnecting', async () => {
    const callbacks = createCallbacks();
    client.setTokenProvider({
      getAccessToken: () => 'valid-token',
      clearTokens: vi.fn(),
    });

    client.stream(PAYLOAD, callbacks);
    await flush();

    fake.socket.connected = false;
    fake.socket.active = true;
    fake.trigger('disconnect', 'transport close');

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledTimes(1);
  });
});
