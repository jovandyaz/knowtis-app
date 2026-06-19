import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentResolvedChip } from './AgentResolvedChip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { title?: string }) =>
      opts?.title ? `${k}:${opts.title}` : k,
  }),
}));

describe('AgentResolvedChip', () => {
  it('renders the committed state with the note title', () => {
    render(
      <AgentResolvedChip committed={{ kind: 'update', title: 'My Note' }} />
    );
    expect(
      screen.getByText(/ai.copilot.proposal.committed.update:My Note/)
    ).toBeInTheDocument();
  });

  it('renders the discarded state', () => {
    render(<AgentResolvedChip discarded />);
    expect(
      screen.getByText('ai.copilot.proposal.discarded')
    ).toBeInTheDocument();
  });

  it('renders nothing when neither prop is set', () => {
    const { container } = render(<AgentResolvedChip />);
    expect(container).toBeEmptyDOMElement();
  });
});
