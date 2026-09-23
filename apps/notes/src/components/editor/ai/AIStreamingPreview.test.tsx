import { useAIStore } from '@/stores/ai.store';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIStreamingPreview } from './AIStreamingPreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STORED_IMAGE =
  'https://knowtis.public.blob.vercel-storage.com/notes/n1/chart.webp';
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
});
