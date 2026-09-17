import { useAgentStore, type QueuedMessage } from '@/stores/agent.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentQueuedMessages } from './AgentQueuedMessages';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const QUEUE: QueuedMessage[] = [
  { id: 'q1', text: 'primero' },
  { id: 'q2', text: 'segundo', noteId: 'n2' },
];

const sendQueuedNow = vi.fn();
const removeQueued = vi.fn();
const storeActions = {
  sendQueuedNow: useAgentStore.getState().sendQueuedNow,
  removeQueued: useAgentStore.getState().removeQueued,
};

describe('AgentQueuedMessages', () => {
  beforeEach(() => {
    sendQueuedNow.mockClear();
    removeQueued.mockClear();
    useAgentStore.setState({ queue: [], sendQueuedNow, removeQueued });
  });

  afterEach(() => {
    useAgentStore.setState(storeActions);
  });

  it('renders nothing for an empty queue', () => {
    const { container } = render(<AgentQueuedMessages />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every queued message in order with its caption', () => {
    useAgentStore.setState({ queue: QUEUE });

    render(<AgentQueuedMessages />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('primero');
    expect(items[1]).toHaveTextContent('segundo');
    expect(screen.getAllByText('ai.copilot.queue')).toHaveLength(2);
  });

  it('wires Send now and Remove to the right item', async () => {
    const user = userEvent.setup();
    useAgentStore.setState({ queue: QUEUE });
    render(<AgentQueuedMessages />);
    const second = screen.getAllByRole('listitem')[1];

    await user.click(
      screen.getAllByRole('button', { name: 'ai.copilot.queueSendNow' })[1]
    );
    expect(sendQueuedNow).toHaveBeenCalledWith('q2');
    await user.click(
      screen.getAllByRole('button', { name: 'ai.copilot.queueRemove' })[1]
    );
    expect(removeQueued).toHaveBeenCalledWith('q2');
    expect(second).toBeInTheDocument();
  });
});
