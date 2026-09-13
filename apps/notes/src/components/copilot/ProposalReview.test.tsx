import type { UpdateProposal } from '@/stores/agent.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProposalReview } from './ProposalReview';
import { useProposalBefore, type ProposalBefore } from './useProposalBefore';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'current' in opts) {
        return `${key}:${opts['current']}/${opts['total']}`;
      }
      if (opts && 'count' in opts) {
        return `${key}:${opts['count']}`;
      }
      return key;
    },
  }),
}));
vi.mock('./useProposalBefore', () => ({ useProposalBefore: vi.fn() }));

const mockedBefore = vi.mocked(useProposalBefore);

const BEFORE_HTML =
  '<h1>Stack</h1><p>Astro como base</p><p>Alternativa: Vercel</p>';
const AFTER_HTML = '<h1>Stack</h1><p>Astro como base del sitio</p>';

const proposal: UpdateProposal = {
  id: 'p1',
  kind: 'update',
  targetNoteId: 'n1',
  summary: 'Update "Stack": title → "Landing", content updated',
  previewHtml: null,
  payload: { title: 'Landing', contentHtml: AFTER_HTML },
};

function ready(
  overrides: Partial<Extract<ProposalBefore, { status: 'ready' }>> = {}
) {
  mockedBefore.mockReturnValue({
    status: 'ready',
    isLive: true,
    title: 'Stack',
    contentHtml: BEFORE_HTML,
    ...overrides,
  });
}

function renderReview(overrides: Partial<UpdateProposal> = {}) {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const onBack = vi.fn();
  const utils = render(
    <ProposalReview
      proposal={{ ...proposal, ...overrides }}
      onApprove={onApprove}
      onReject={onReject}
      onBack={onBack}
    />
  );
  return { ...utils, onApprove, onReject, onBack };
}

describe('ProposalReview', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    navigate.mockReset();
    ready();
  });

  it('shows a skeleton and disables the actions while the before version loads', () => {
    mockedBefore.mockReturnValue({ status: 'loading' });
    renderReview();
    expect(screen.getByText('editor.loadingNote')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeDisabled();
  });

  it('never renders the server summary', () => {
    renderReview();
    expect(screen.queryByText(proposal.summary)).not.toBeInTheDocument();
  });

  it('shows the title change, the summary line and the total count', async () => {
    renderReview();
    expect(screen.getByTestId('review-title')).toHaveTextContent('Landing');
    expect(
      screen.getByText(/ai\.copilot\.review\.summary\.titleAndContent/)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText('ai.copilot.review.changeOf:1/2')
      ).toBeInTheDocument()
    );
  });

  it('does not show a title row when the title is unchanged', () => {
    renderReview({ payload: { contentHtml: AFTER_HTML } });
    expect(screen.queryByTestId('review-title')).not.toBeInTheDocument();
    expect(
      screen.getByText(/ai\.copilot\.review\.summary\.contentOnly/)
    ).toBeInTheDocument();
  });

  it('steps through changes and rings the current one', async () => {
    const { container } = renderReview();
    await screen.findByText('ai.copilot.review.changeOf:1/2');
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.next' })
    );
    expect(
      screen.getByText('ai.copilot.review.changeOf:2/2')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.diff-current')).toBeInTheDocument()
    );
  });

  it('expands deletions with the show-deleted switch', async () => {
    const { container } = renderReview();
    await screen.findByRole('button', {
      name: 'ai.copilot.review.deletedBlocks:2',
    });
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toHaveTextContent(
        'Alternativa: Vercel'
      )
    );
  });

  it('applies, and discards with a reason', async () => {
    const { onApprove, onReject } = renderReview();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.proposal.reject' })
    );
    await userEvent.type(
      screen.getByRole('textbox', {
        name: 'ai.copilot.proposal.reasonPlaceholder',
      }),
      'keep Vercel'
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: /ai\.copilot\.proposal\.rejectConfirm/,
      })
    );
    expect(onReject).toHaveBeenCalledWith('keep Vercel');
  });

  it('discards on Escape and goes back without deciding', async () => {
    const { onReject, onBack } = renderReview();
    fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' });
    expect(onReject).toHaveBeenCalledWith();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.back' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers to open the target note when it is not the live one', async () => {
    ready({ isLive: false });
    renderReview();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.openNote' })
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { noteId: 'n1' } })
    );
  });

  it('falls back to the plain proposal when the before version failed', async () => {
    mockedBefore.mockReturnValue({ status: 'error' });
    const { container } = renderReview();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.review.beforeUnavailable'
    );
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')).toHaveTextContent(
        'del sitio'
      )
    );
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeEnabled();
  });
});
