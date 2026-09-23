import { queryClient } from '@/lib/query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { agentClient } from '@knowtis/api-client';
import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentProposalPayload,
  AgentStreamHandle,
} from '@knowtis/api-client';
import { conversationsQueryKeys } from '@knowtis/data-access-agent';
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
    return { cancel } as AgentStreamHandle;
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
