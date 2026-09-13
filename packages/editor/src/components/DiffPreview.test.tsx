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
    fireEvent.click(chip);
    await waitFor(() =>
      expect(container.querySelector('.diff-del-block')).toHaveTextContent(
        'Dos'
      )
    );
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

  it('rings the current change', async () => {
    const { container } = renderDiff('<p>Astro</p>', '<p>Astro y Vite</p>', {
      currentIndex: 0,
    });
    await waitFor(() =>
      expect(container.querySelector('.diff-ins')).toHaveClass('diff-current')
    );
  });
});
