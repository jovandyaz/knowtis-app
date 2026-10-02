import i18n from '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { AGENT_STOP_REASON, MESSAGE_KIND } from '@knowtis/shared-types';

import { AgentMessage } from './AgentMessage';

describe('AgentMessage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a continue marker as a chip, never as a bubble', () => {
    render(
      <AgentMessage
        message={{
          id: 'm1',
          turnId: 't2',
          role: 'user',
          content: '',
          kind: MESSAGE_KIND.CONTINUE,
        }}
        isStreaming={false}
      />
    );

    expect(screen.getByText('Continue')).toHaveClass('bg-muted');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when a reply was interrupted', () => {
    render(
      <AgentMessage
        message={{
          id: 'm2',
          role: 'assistant',
          content: 'Revisé',
          interrupted: true,
        }}
        isStreaming={false}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'This reply was interrupted.'
    );
  });

  it('renders its footer under the answer', () => {
    render(
      <AgentMessage
        message={{
          id: 'm3',
          role: 'assistant',
          content: 'Revisé tres notas.',
          stopReason: AGENT_STOP_REASON.MAX_STEPS,
        }}
        isStreaming={false}
        footer={<button type="button">next</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
  });
});
