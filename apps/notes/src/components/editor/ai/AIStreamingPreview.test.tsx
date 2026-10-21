import { useAIStore } from '@/stores/ai.store';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIStreamingPreview } from './AIStreamingPreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STORED_IMAGE =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/chart.webp';
const RAW_IMAGE = '<img src="https://attacker.example/raw.png">';
const RAW_SCRIPT = '<script>window.pwned = true</script>';
const LAST_LINE = 'Rewritten sentence.';
const COMPLETION = [
  '![beacon](https://attacker.example/t.png)',
  RAW_IMAGE,
  RAW_SCRIPT,
  `![chart](${STORED_IMAGE})`,
  LAST_LINE,
].join('\n\n');

describe('AIStreamingPreview', () => {
  afterEach(() => {
    useAIStore.getState().reset();
  });

  it.each(['streaming', 'done'] as const)(
    'renders a %s completion without foreign images or raw HTML',
    async (status) => {
      useAIStore.setState({ status, streamedText: COMPLETION });

      const { container } = render(
        <AIStreamingPreview
          onReplace={vi.fn()}
          onInsertBelow={vi.fn()}
          onDiscard={vi.fn()}
        />
      );

      await waitFor(() => expect(container.textContent).toContain(LAST_LINE));
      expect(
        [...container.querySelectorAll('img')].map((img) =>
          img.getAttribute('src')
        )
      ).toEqual([STORED_IMAGE]);
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain(RAW_IMAGE);
      expect(container.textContent).toContain(RAW_SCRIPT);
    }
  );

  describe('on a narrow screen', () => {
    const EDITOR_WIDTH_PX = 600;
    const VIEWPORT_CAP = 'max-w-[calc(100vw-1rem)]';

    it.each([
      ['the editor width it is given', EDITOR_WIDTH_PX],
      ['its default width', undefined],
    ])('keeps %s inside the viewport', (_, width) => {
      useAIStore.setState({ status: 'done', streamedText: LAST_LINE });

      const { container } = render(
        <AIStreamingPreview
          {...(width && { width })}
          onReplace={vi.fn()}
          onInsertBelow={vi.fn()}
          onDiscard={vi.fn()}
        />
      );

      expect(container.firstElementChild).toHaveClass(VIEWPORT_CAP);
    });

    it('wraps the actions of a finished answer instead of overflowing', () => {
      useAIStore.setState({ status: 'done', streamedText: LAST_LINE });

      render(
        <AIStreamingPreview
          width={EDITOR_WIDTH_PX}
          onReplace={vi.fn()}
          onInsertBelow={vi.fn()}
          onDiscard={vi.fn()}
        />
      );

      const answerActions = screen.getByRole('button', {
        name: 'ai.preview.replace',
      }).parentElement;
      const discardAction = screen.getByRole('button', {
        name: 'ai.preview.discard',
      }).parentElement;
      expect(answerActions).toHaveClass('flex-wrap');
      expect(answerActions?.parentElement).toHaveClass('flex-wrap');
      expect(answerActions?.parentElement).toContainElement(discardAction);
    });
  });
});
