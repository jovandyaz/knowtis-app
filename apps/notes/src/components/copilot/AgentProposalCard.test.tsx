import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentProposalCard } from './AgentProposalCard';

const proposal = {
  id: 'p1',
  kind: 'create' as const,
  targetNoteId: null,
  summary: 'Create note "GTD"',
  previewHtml: '<p>do</p>',
  payload: { title: 'GTD' },
};

describe('AgentProposalCard', () => {
  it('renders the summary and fires approve', async () => {
    const onApprove = vi.fn();
    render(
      <AgentProposalCard
        proposal={proposal}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Create note "GTD"')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: /create|apply|approve|crear|aplicar|approveCreate/i,
      })
    );
    expect(onApprove).toHaveBeenCalled();
  });

  it('reveals a reason field and fires reject with the reason', async () => {
    const onReject = vi.fn();
    render(
      <AgentProposalCard
        proposal={proposal}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: /dismiss|reject|descartar|rechazar|proposal\.reject$/i,
      })
    );
    const reason = screen.getByRole('textbox');
    await userEvent.type(reason, 'too long');
    await userEvent.click(
      screen.getByRole('button', { name: /send|confirm|enviar|rejectConfirm/i })
    );
    expect(onReject).toHaveBeenCalledWith('too long');
  });

  it('calls onReject with undefined when reason is whitespace-only', async () => {
    const onReject = vi.fn();
    render(
      <AgentProposalCard
        proposal={proposal}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: /dismiss|reject|descartar|rechazar|proposal\.reject$/i,
      })
    );
    const reason = screen.getByRole('textbox');
    await userEvent.type(reason, '   ');
    await userEvent.click(
      screen.getByRole('button', { name: /send|confirm|enviar|rejectConfirm/i })
    );
    expect(onReject).toHaveBeenCalledWith(undefined);
  });
});
