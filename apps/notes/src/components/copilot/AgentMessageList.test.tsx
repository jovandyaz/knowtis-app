import type { AgentChatMessage } from '@/stores/agent.store';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentMessageList } from './AgentMessageList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./AgentMessage', () => ({
  AgentMessage: ({ message }: { message: AgentChatMessage }) => (
    <div data-testid="message">{message.content}</div>
  ),
}));

const turn = (content: string): AgentChatMessage[] => [
  { id: 'u1', role: 'user', content: 'hola' },
  { id: 'a1', role: 'assistant', content },
];

const shimmerLines = (container: HTMLElement) =>
  container.querySelectorAll('[data-testid="shimmer-line"]').length;

describe('AgentMessageList', () => {
  it('shows the reasoning while the answer has not started', () => {
    const { container } = render(
      <AgentMessageList
        messages={turn('')}
        status="streaming"
        thinkingDetail="weighing the note"
      />
    );

    expect(screen.getByText('weighing the note')).toBeInTheDocument();
    expect(screen.getByText('ai.copilot.thinking')).toBeInTheDocument();
    expect(shimmerLines(container)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the reasoning once the first answer token arrives', () => {
    render(
      <AgentMessageList
        messages={turn('La')}
        status="streaming"
        thinkingDetail="weighing the note"
      />
    );

    expect(screen.getByText('weighing the note')).toBeInTheDocument();
  });

  it('drops the loading shimmer and relabels once answering', () => {
    const { container } = render(
      <AgentMessageList
        messages={turn('La respuesta')}
        status="streaming"
        thinkingDetail="weighing the note"
      />
    );

    expect(screen.getByText('ai.copilot.reasoning')).toBeInTheDocument();
    expect(screen.queryByText('ai.copilot.thinking')).toBeNull();
    expect(shimmerLines(container)).toBe(0);
  });

  it('renders no panel while answering without reasoning', () => {
    render(
      <AgentMessageList messages={turn('La respuesta')} status="streaming" />
    );

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('drops the panel when the turn ends', () => {
    render(
      <AgentMessageList
        messages={turn('La respuesta')}
        status="done"
        thinkingDetail="weighing the note"
      />
    );

    expect(screen.queryByRole('status')).toBeNull();
  });
});
