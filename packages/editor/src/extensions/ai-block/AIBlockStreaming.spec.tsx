import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AIBlockStreaming } from './AIBlockStreaming';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STORED_IMAGE =
  'https://knowtis.public.blob.vercel-storage.com/notes/n1/chart.webp';
const RAW_IMAGE = '<img src="https://attacker.example/raw.png">';
const LAST_LINE = 'Still writing';
const STREAMED = [
  '![beacon](https://attacker.example/t.png)',
  RAW_IMAGE,
  `![chart](${STORED_IMAGE})`,
  LAST_LINE,
].join('\n\n');

describe('AIBlockStreaming', () => {
  it('streams only blob-store images and shows raw HTML as text', async () => {
    const { container } = render(
      <AIBlockStreaming streamedText={STREAMED} onCancel={vi.fn()} />
    );

    await waitFor(() => expect(container.textContent).toContain(LAST_LINE));
    expect(
      [...container.querySelectorAll('img')].map((img) =>
        img.getAttribute('src')
      )
    ).toEqual([STORED_IMAGE]);
    expect(container.textContent).toContain(RAW_IMAGE);
  });
});
