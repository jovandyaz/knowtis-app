import type { AgentChatMessage, AgentStatus } from '@/stores/agent.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const DETAIL = 'weighing the note';

interface ListOptions {
  content: string;
  status?: AgentStatus;
  detail?: string;
}

const list = ({ content, status, detail }: ListOptions) => (
  <AgentMessageList
    messages={[
      { id: 'u1', role: 'user', content: 'hola' },
      { id: 'a1', role: 'assistant', content },
    ]}
    status={status ?? 'streaming'}
    {...(detail === undefined ? {} : { thinkingDetail: detail })}
  />
);

const shimmerLines = (container: HTMLElement) =>
  container.querySelectorAll('[data-testid="shimmer-line"]').length;

describe('AgentMessageList', () => {
  it('shows the reasoning while the answer has not started', () => {
    const { container } = render(list({ content: '', detail: DETAIL }));

    expect(screen.getByText(DETAIL)).toBeInTheDocument();
    expect(screen.getByText('ai.copilot.thinking')).toBeInTheDocument();
    expect(shimmerLines(container)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the reasoning once the first answer token arrives', () => {
    render(list({ content: 'La', detail: DETAIL }));
    expect(screen.getByText(DETAIL)).toBeInTheDocument();
  });

  it('drops the loading shimmer and relabels once answering', () => {
    const { container } = render(
      list({ content: 'La respuesta', detail: DETAIL })
    );

    expect(screen.getByText('ai.copilot.reasoning')).toBeInTheDocument();
    expect(screen.queryByText('ai.copilot.thinking')).toBeNull();
    expect(shimmerLines(container)).toBe(0);
  });

  it('renders no panel while answering without reasoning', () => {
    const { container } = render(list({ content: 'La respuesta' }));

    expect(screen.queryByText('ai.copilot.reasoning')).toBeNull();
    expect(screen.queryByText('ai.copilot.thinking')).toBeNull();
    expect(shimmerLines(container)).toBe(0);
  });

  it('keeps the panel expanded when reasoning pauses mid-turn', async () => {
    const user = userEvent.setup();
    const { rerender } = render(list({ content: '', detail: DETAIL }));

    await user.click(screen.getByText('ai.copilot.thinking'));
    expect(screen.getByText(DETAIL)).toHaveClass('overflow-y-auto');

    rerender(list({ content: 'La respuesta' }));
    expect(screen.queryByText(DETAIL)).toBeNull();

    rerender(list({ content: 'La respuesta', detail: `${DETAIL} y más` }));
    expect(screen.getByText(`${DETAIL} y más`)).toHaveClass('overflow-y-auto');
  });

  it.each([
    ['done', 'La respuesta'],
    ['pendingProposal', 'La respuesta'],
    ['error', ''],
  ] as const)(
    'drops the panel once the turn leaves streaming (%s)',
    (status, content) => {
      render(list({ content, status, detail: DETAIL }));

      expect(screen.queryByText(DETAIL)).toBeNull();
      expect(screen.queryByText('ai.copilot.thinking')).toBeNull();
    }
  );

  it('shows no panel while the user message is still the last one', () => {
    render(
      <AgentMessageList
        messages={[{ id: 'u1', role: 'user', content: 'hola' }]}
        status="streaming"
        thinkingDetail={DETAIL}
      />
    );

    expect(screen.queryByText(DETAIL)).toBeNull();
  });

  it('shows no panel with an empty conversation', () => {
    render(
      <AgentMessageList
        messages={[]}
        status="streaming"
        thinkingDetail={DETAIL}
      />
    );

    expect(screen.queryByText(DETAIL)).toBeNull();
  });
});
