import i18n from '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { AGENT_STOP_REASON } from '@knowtis/shared-types';

import { AgentStopNotice } from './AgentStopNotice';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('AgentStopNotice', () => {
  it.each([
    [AGENT_STOP_REASON.MAX_STEPS, 'The step limit was reached.'],
    [AGENT_STOP_REASON.TOKEN_BUDGET, 'The turn budget was reached.'],
    [AGENT_STOP_REASON.LENGTH, 'The response was cut short.'],
    [AGENT_STOP_REASON.CONTENT_FILTER, 'The provider filtered this response.'],
  ])('announces %s as a status', (reason, message) => {
    render(<AgentStopNotice reason={reason} />);

    expect(screen.getByRole('status')).toHaveTextContent(message);
  });

  it('renders nothing when the turn completed normally', () => {
    render(<AgentStopNotice reason={AGENT_STOP_REASON.COMPLETED} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders nothing without a stop reason', () => {
    render(<AgentStopNotice />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
