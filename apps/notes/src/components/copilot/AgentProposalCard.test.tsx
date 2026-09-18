import type { PendingProposal } from '@/stores/agent.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentProposalCard } from './AgentProposalCard';

const proposal = {
  id: 'p1',
  kind: 'create' as const,
  targetNoteId: null,
  payload: { title: 'GTD', contentHtml: '<p>do</p>' },
};

describe('AgentProposalCard', () => {
  it('never renders the summary the wire object still carries', () => {
    const wire = {
      ...proposal,
      summary: 'Create note "GTD"',
    } as unknown as PendingProposal;
    render(
      <AgentProposalCard
        proposal={wire}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByText('Create note "GTD"')).not.toBeInTheDocument();
  });

  it('renders the proposal kind and fires approve', async () => {
    const onApprove = vi.fn();
    render(
      <AgentProposalCard
        proposal={proposal}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    expect(
      screen.getByText(/create note|crear nota|createTitle/i)
    ).toBeInTheDocument();
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
    const reason = screen.getByRole('textbox', {
      name: /why|por qué|reasonPlaceholder/i,
    });
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
    const reason = screen.getByRole('textbox', {
      name: /why|por qué|reasonPlaceholder/i,
    });
    await userEvent.type(reason, '   ');
    await userEvent.click(
      screen.getByRole('button', { name: /send|confirm|enviar|rejectConfirm/i })
    );
    expect(onReject).toHaveBeenCalledWith(undefined);
  });

  it('renders the preview in a scrollable (not clipped) region', () => {
    render(
      <AgentProposalCard
        proposal={{
          id: 'p1',
          kind: 'update' as const,
          targetNoteId: 'n1',
          payload: { contentHtml: '<p>long content</p>' },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const region = screen.getByTestId('proposal-preview');
    expect(region.className).toContain('overflow-y-auto');
    expect(region.className).not.toContain('overflow-hidden');
  });

  it('approves on Cmd/Ctrl+Enter and rejects on Escape', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <AgentProposalCard
        proposal={{
          id: 'p1',
          kind: 'update' as const,
          targetNoteId: 'n1',
          payload: { contentHtml: '<p>x</p>' },
        }}
        onApprove={onApprove}
        onReject={onReject}
      />
    );
    const card = screen.getByRole('group');
    fireEvent.keyDown(card, { key: 'Enter', metaKey: true });
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('renders the create preview through the read-only editor', async () => {
    render(
      <AgentProposalCard
        proposal={proposal}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const region = screen.getByTestId('proposal-preview');
    await waitFor(() =>
      expect(region.querySelector('.ProseMirror')).toHaveTextContent('do')
    );
  });
});
