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
});
