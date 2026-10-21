import type { PendingProposal } from '@/stores/agent.store';
import { expectLinkNavigationBlocked } from '@/test/link-navigation';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    fireEvent.keyDown(card, { key: 'Escape', isComposing: true });
    expect(onReject).not.toHaveBeenCalled();
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('previews an image from the app store and drops one from another host', async () => {
    const storedSrc =
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp';
    render(
      <AgentProposalCard
        proposal={{
          ...proposal,
          payload: {
            title: 'Trip',
            contentHtml:
              `<figure data-image=""><img src="${storedSrc}" alt="lake"><figcaption>Lake</figcaption></figure>` +
              '<figure data-image=""><img src="https://attacker.example/collect.png" alt="x"><figcaption>Planted</figcaption></figure>',
          },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const region = screen.getByTestId('proposal-preview');
    await waitFor(() =>
      expect(
        [...region.querySelectorAll('img')].map((img) =>
          img.getAttribute('src')
        )
      ).toEqual([storedSrc])
    );
    expect(region).toHaveTextContent('Lake');
    expect(region).not.toHaveTextContent('Planted');
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

  it('blocks navigation from a link in the preview but not other clicks', async () => {
    render(
      <AgentProposalCard
        proposal={{
          ...proposal,
          payload: {
            title: 'GTD',
            contentHtml: '<p>plain <a href="https://evil.test/?q=1">go</a></p>',
          },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const region = screen.getByTestId('proposal-preview');
    await within(region).findByRole('link');
    expectLinkNavigationBlocked(region, 'plain');
  });
});

describe('AgentProposalCard after content someone else wrote', () => {
  const share: PendingProposal = {
    id: 'p2',
    kind: 'share',
    targetNoteId: 'n1',
    payload: { targetEmail: 'colleague@example.com', permission: 'viewer' },
  };
  const WARNING =
    /check the recipient|revisa el destinatario|foreignContentWarning/i;

  it('warns to check the recipient of a share proposed after it', () => {
    render(
      <AgentProposalCard
        proposal={{ ...share, readForeignContent: true }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(WARNING);
  });

  it.each([
    ['marked clean', { ...share, readForeignContent: false }],
    ['unmarked, as an older server sends it', share],
  ])('shows no warning on a share %s', (_what, unmarked) => {
    render(
      <AgentProposalCard
        proposal={unmarked}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('shows no warning on another kind of proposal, even when marked', () => {
    render(
      <AgentProposalCard
        proposal={{ ...proposal, readForeignContent: true }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
