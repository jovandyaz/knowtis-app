import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore, type AgentChatMessage } from './agent.store';

vi.mock('@knowtis/api-client', () => ({
  agentClient: {
    sendMessage: vi.fn(() => ({ cancel: vi.fn() })),
    resetConversation: vi.fn(),
    approve: vi.fn(() => true),
    reject: vi.fn(() => true),
  },
}));
vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

const seed = (messages: AgentChatMessage[], extra = {}) =>
  useAgentStore.setState({ messages, ...extra } as never);

describe('agent.store resolution markers', () => {
  beforeEach(() => {
    useAgentStore.setState({
      messages: [],
      status: 'idle',
      pendingProposal: null,
      error: null,
    } as never);
  });

  it('marks the proposing message discarded on reject', () => {
    seed(
      [
        { id: 'm1', role: 'user', content: 'edit it' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'sure',
          proposal: { kind: 'update', summary: 's' },
        },
      ],
      {
        pendingProposal: {
          id: 'p1',
          kind: 'update',
          targetNoteId: 'n1',
          summary: 's',
          previewHtml: '<p>x</p>',
          payload: {},
        },
        status: 'pendingProposal',
      }
    );

    useAgentStore.getState().rejectProposal('nope');

    const m2 = useAgentStore.getState().messages.find((m) => m.id === 'm2');
    expect(m2?.discarded).toBe(true);
  });
});
