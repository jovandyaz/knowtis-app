import type { UpdateProposal } from '@/stores/agent.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DIFF_MAX_HTML_CHARS, ProposalReview } from './ProposalReview';
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

  it('never renders the summary the wire object still carries', () => {
    renderReview({
      summary: 'Update "Landing": content updated',
    } as unknown as Partial<UpdateProposal>);
    expect(
      screen.queryByText('Update "Landing": content updated')
    ).not.toBeInTheDocument();
  });

  it('shows a skeleton and disables the actions while the before version loads', () => {
    mockedBefore.mockReturnValue({ status: 'loading' });
    renderReview();
    expect(screen.getByText('editor.loadingNote')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeDisabled();
  });

  it('shows the title change, the summary line and the change counter', async () => {
    renderReview();
    expect(screen.getByTestId('review-title')).toHaveTextContent('Landing');
    expect(
      screen.getByText(/ai\.copilot\.review\.summary\.titleAndContent/)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText('ai.copilot.review.changeOf:1/3')
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: 'ai.copilot.review.next' })
    ).toBeEnabled();
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
    await screen.findByText('ai.copilot.review.changeOf:1/3');
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.next' })
    );
    expect(
      screen.getByText('ai.copilot.review.changeOf:2/3')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.diff-current')).toBeInTheDocument()
    );
  });

  it('scrolls the title row into view when navigating back to it', async () => {
    const scrolledInto: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolledInto.push(this);
    });
    renderReview();
    await screen.findByText('ai.copilot.review.changeOf:1/3');
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.next' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.copilot.review.prev' })
    );
    const titleRow = screen.getByTestId('review-title');
    await waitFor(() => expect(scrolledInto.at(-1)).toBe(titleRow));
  });

  it('expands deletions with the show-deleted switch', async () => {
    const { container } = renderReview();
    await screen.findByRole('button', {
      name: 'ai.copilot.review.deletedBlocks:1',
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

  it('takes focus on mount so the shortcuts work without a click', () => {
    renderReview();
    expect(screen.getByRole('group')).toHaveFocus();
  });

  it('leaves the caret alone when the user is typing in the live note', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    document.body.append(editable);
    editable.focus();

    try {
      renderReview();

      expect(editable).toHaveFocus();
      expect(screen.getByRole('group')).not.toHaveFocus();
    } finally {
      editable.remove();
    }
  });

  it('leaves the caret alone when the user is typing in the note title', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    try {
      renderReview();

      expect(input).toHaveFocus();
      expect(screen.getByRole('group')).not.toHaveFocus();
    } finally {
      input.remove();
    }
  });

  it('shows a focus ring when the review container takes focus', () => {
    renderReview();
    expect(screen.getByRole('group')).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-inset',
      'focus-visible:ring-ring'
    );
  });

  it('skips the diff and says why when the note is too big to compare', async () => {
    ready({ contentHtml: `<p>${'a'.repeat(DIFF_MAX_HTML_CHARS)}</p>` });
    const { container } = renderReview();

    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.copilot.review.tooLargeForDiff'
    );
    expect(
      screen.queryByText('ai.copilot.review.beforeUnavailable')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ai\.copilot\.review\.changeOf/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ai.copilot.review.next' })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')).toHaveTextContent(
        'del sitio'
      )
    );
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeEnabled();
  });

  it('still compares a note that fits under the diff cap', async () => {
    ready();
    renderReview();
    expect(
      await screen.findByText('ai.copilot.review.changeOf:1/3')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ai.copilot.review.tooLargeForDiff')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports an empty diff and still allows applying it', async () => {
    renderReview({ payload: { contentHtml: BEFORE_HTML } });
    expect(
      await screen.findByText('ai.copilot.review.noChanges')
    ).toBeInTheDocument();
    expect(screen.getByText('ai.copilot.review.changes:0')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeEnabled();
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

  describe('images', () => {
    const STORED_SRC =
      'https://knowtis.public.blob.vercel-storage.com/notes/n1/lake.webp';
    const FOREIGN_SRC = 'https://attacker.example/collect.png';
    const figure = (src: string, caption: string) =>
      `<figure data-image=""><img src="${src}" alt="lake"><figcaption>${caption}</figcaption></figure>`;
    const imageSources = (container: HTMLElement) =>
      [...container.querySelectorAll('img')].map((img) =>
        img.getAttribute('src')
      );

    it('reports only the text change when the proposal keeps the image', async () => {
      const kept = `<p>Intro</p>${figure(STORED_SRC, 'Lake')}`;
      ready({ contentHtml: `${kept}<p>Old text.</p>` });
      const { container } = renderReview({
        payload: { contentHtml: `${kept}<p>New text.</p>` },
      });

      expect(
        await screen.findByText('ai.copilot.review.changeOf:1/1')
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /ai\.copilot\.review\.deletedBlocks/,
        })
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(imageSources(container)).toEqual([STORED_SRC])
      );
    });

    it('shows an image the proposal adds from the app store', async () => {
      ready({ contentHtml: '<p>Intro</p>' });
      const { container } = renderReview({
        payload: { contentHtml: `<p>Intro</p>${figure(STORED_SRC, 'Lake')}` },
      });

      expect(
        await screen.findByText('ai.copilot.review.changeOf:1/1')
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(imageSources(container)).toEqual([STORED_SRC])
      );
    });

    it('drops an image from another host with its caption, as approval does', async () => {
      ready({ contentHtml: '<p>Intro</p>' });
      const { container } = renderReview({
        payload: {
          contentHtml: `<p>Intro</p>${figure(FOREIGN_SRC, 'Planted')}`,
        },
      });

      expect(
        await screen.findByText('ai.copilot.review.noChanges')
      ).toBeInTheDocument();
      expect(imageSources(container)).toEqual([]);
      expect(container).not.toHaveTextContent('Planted');
    });
  });

  it('still shows a title-only proposal when the before version failed', () => {
    mockedBefore.mockReturnValue({ status: 'error' });
    renderReview({ payload: { title: 'Landing' } });

    const titleRow = screen.getByTestId('review-title');
    expect(titleRow).toHaveTextContent('Landing');
    expect(titleRow.querySelector('del')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'ai.copilot.proposal.approveUpdate' })
    ).toBeEnabled();
  });
});
