import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentQueuedMessages } from './AgentQueuedMessages';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const QUEUE = [
  { id: 'q1', text: 'primero' },
  { id: 'q2', text: 'segundo', noteId: 'n2' },
];

describe('AgentQueuedMessages', () => {
  it('renders nothing for an empty queue', () => {
    const { container } = render(
      <AgentQueuedMessages queue={[]} onSendNow={vi.fn()} onRemove={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every queued message in order with its caption', () => {
    render(
      <AgentQueuedMessages
        queue={QUEUE}
        onSendNow={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('primero');
    expect(items[1]).toHaveTextContent('segundo');
    expect(screen.getAllByText('ai.copilot.queue')).toHaveLength(2);
  });

  it('wires Send now and Remove to the right item', async () => {
    const onSendNow = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <AgentQueuedMessages
        queue={QUEUE}
        onSendNow={onSendNow}
        onRemove={onRemove}
      />
    );
    const second = screen.getAllByRole('listitem')[1];
    await user.click(
      screen.getAllByRole('button', { name: 'ai.copilot.queueSendNow' })[1]
    );
    expect(onSendNow).toHaveBeenCalledWith('q2');
    await user.click(
      screen.getAllByRole('button', { name: 'ai.copilot.queueRemove' })[1]
    );
    expect(onRemove).toHaveBeenCalledWith('q2');
    expect(second).toBeInTheDocument();
  });
});
