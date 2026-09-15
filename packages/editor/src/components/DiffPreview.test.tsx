import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { diffNoteHtml } from '../diff/diff-note-html';
import { createBaseExtensions } from '../extensions/base-extensions';
import { DiffPreview, type DiffPreviewProps } from './DiffPreview';

const EXTENSIONS = createBaseExtensions();
const labels = {
  deletedBlocks: (count: number) => `${count} deleted`,
  deletedInline: 'deleted text',
};

function renderDiff(
  before: string,
  after: string,
  props: Partial<DiffPreviewProps> = {}
) {
  const diff = diffNoteHtml(before, after, EXTENSIONS);
  return render(
    <DiffPreview
      diff={diff}
      extensions={EXTENSIONS}
      showDeleted={false}
      currentIndex={null}
      labels={labels}
      {...props}
    />
  );
}

describe('DiffPreview', () => {
  it('marks inserted text with its change index', async () => {
    const { container } = renderDiff(
      '<p>Astro como base</p>',
      '<p>Astro como base del sitio</p>'
    );
    await waitFor(() =>
      expect(
        container.querySelector('.diff-ins[data-change="0"]')
      ).toHaveTextContent('del sitio')
    );
  });

  it('marks a fully inserted paragraph as a block insertion', async () => {
    const { container } = renderDiff('<p>Uno</p>', '<p>Uno</p><p>Dos</p>');
    await waitFor(() =>
      expect(container.querySelector('p.diff-ins-block')).toHaveTextContent(
        'Dos'
      )
    );
  });

  it('collapses a removed paragraph into a chip and expands it on click', async () => {
    const { container } = renderDiff('<p>Uno</p><p>Dos</p>', '<p>Uno</p>');
    const chip = await screen.findByRole('button', { name: '1 deleted' });
    expect(container.querySelector('.diff-del')).toBeNull();
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toHaveTextContent(
        'Dos'
      )
    );
  });

  it('collapses an expanded deletion again and reports its state truthfully', async () => {
    const { container } = renderDiff('<p>Uno</p><p>Dos</p>', '<p>Uno</p>');
    fireEvent.click(await screen.findByRole('button', { name: '1 deleted' }));

    const openChip = await waitFor(() => {
      const button = screen.getByRole('button', { name: '1 deleted' });
      expect(button).toHaveAttribute('aria-expanded', 'true');
      return button;
    });

    fireEvent.click(openChip);
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toBeNull()
    );
    expect(screen.getByRole('button', { name: '1 deleted' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('marks the widget content inert so it is never an edit target', async () => {
    const { container } = renderDiff('<p>Uno</p><p>Dos</p>', '<p>Uno</p>');
    const chip = await screen.findByRole('button', { name: '1 deleted' });
    expect(chip).toHaveAttribute('contenteditable', 'false');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(
        container.querySelector('.diff-del-group[contenteditable="false"]')
      ).not.toBeNull()
    );
  });

  it('renders insertions and deletions as ins and del elements', async () => {
    const { container } = renderDiff(
      '<p>Uno</p><p>Dos</p>',
      '<p>Uno y medio</p>',
      { showDeleted: true }
    );
    await waitFor(() =>
      expect(container.querySelector('ins.diff-ins')).toHaveTextContent(
        'y medio'
      )
    );
    expect(container.querySelector('del.diff-del')).toHaveTextContent('Dos');
  });

  it('shows a bolded word as an inline change, not a removed block', async () => {
    const { container } = renderDiff(
      '<p>Astro como base del sitio</p>',
      '<p>Astro como <strong>base</strong> del sitio</p>'
    );
    await waitFor(() =>
      expect(container.querySelector('ins.diff-ins')).toHaveTextContent(
        /^base$/
      )
    );
    expect(container.querySelector('strong > ins.diff-ins')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'deleted text' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 deleted' })).toBeNull();
  });

  it('labels an inline deletion differently from removed blocks', async () => {
    renderDiff('<p>Uno y dos</p>', '<p>Uno</p>');
    expect(
      await screen.findByRole('button', { name: 'deleted text' })
    ).toBeInTheDocument();
  });

  it('expands every deletion when showDeleted is on', async () => {
    const { container } = renderDiff('<p>Uno</p><p>Dos</p>', '<p>Uno</p>', {
      showDeleted: true,
    });
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toHaveTextContent(
        'Dos'
      )
    );
    expect(screen.queryByRole('button', { name: '1 deleted' })).toBeNull();
  });

  it('does not count the torn boundary paragraph as a removed block', async () => {
    const { container } = renderDiff(
      '<p>Astro como base</p><p>Alternativa: Vercel</p>',
      '<p>Astro como base del sitio</p>'
    );
    const chip = await screen.findByRole('button', { name: '1 deleted' });
    fireEvent.click(chip);
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toHaveTextContent(
        'Alternativa: Vercel'
      )
    );
  });

  it('still counts a genuinely deleted blank paragraph', async () => {
    renderDiff('<p>Uno</p><p></p><p>Dos</p>', '<p>Uno</p>');
    await screen.findByRole('button', { name: '2 deleted' });
  });

  it('places a removed paragraph between the paragraphs that survive it', async () => {
    renderDiff('<p>Uno</p><p>Dos</p><p>Tres</p>', '<p>Uno</p><p>Tres</p>');
    const chip = await screen.findByRole('button', { name: '1 deleted' });
    expect(chip.previousElementSibling).toHaveTextContent('Uno');
    expect(chip.nextElementSibling).toHaveTextContent('Tres');
  });

  it('labels a merged paragraph break as removed text, not a removed block', async () => {
    renderDiff(
      '<ul><li><p>alfa</p></li><li><p>beta</p></li></ul>',
      '<ul><li><p>alfa beta</p></li></ul>'
    );
    expect(
      await screen.findByRole('button', { name: 'deleted text' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\d+ deleted/ })).toBeNull();
  });

  it('renders a deleted inline node instead of hiding it as a boundary chip', async () => {
    const { container } = renderDiff('<p>a<br>b</p>', '<p>ab</p>', {
      showDeleted: true,
    });
    await waitFor(() =>
      expect(container.querySelector('del br')).not.toBeNull()
    );
  });

  it('keeps a merged paragraph break as a chip even with Show deleted on', async () => {
    const { container } = renderDiff(
      '<ul><li><p>alfa</p></li><li><p>beta</p></li></ul>',
      '<ul><li><p>alfa beta</p></li></ul>',
      { showDeleted: true }
    );
    expect(
      await screen.findByRole('button', { name: 'deleted text' })
    ).toBeInTheDocument();
    expect(container.querySelector('del')).toBeNull();
  });

  it('rings the current change', async () => {
    const { container } = renderDiff('<p>Astro</p>', '<p>Astro y Vite</p>', {
      currentIndex: 0,
    });
    await waitFor(() =>
      expect(container.querySelector('.diff-ins')).toHaveClass('diff-current')
    );
  });
});
