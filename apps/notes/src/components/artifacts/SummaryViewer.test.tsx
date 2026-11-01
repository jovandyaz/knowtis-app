import { expectLinkNavigationBlocked } from '@/test/link-navigation';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SummaryArtifact } from '@knowtis/shared-types';

import { SummaryViewer } from './SummaryViewer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const artifact: SummaryArtifact = {
  id: 'a1',
  userId: 'u1',
  sourceNoteId: 'n1',
  title: 'Key ideas',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  type: 'summary',
  content: {
    summary: '<p>plain <a href="https://evil.test/?q=1">go</a></p>',
    keyPoints: [],
  },
};

describe('SummaryViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks navigation from a link in the summary', () => {
    render(<SummaryViewer artifact={artifact} />);
    expectLinkNavigationBlocked(document.body, 'plain');
  });

  it('confirms a copy on the button and in a mounted live region, without a toast', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    render(
      <SummaryViewer
        artifact={{
          ...artifact,
          content: { ...artifact.content, keyPoints: ['one', 'two'] },
        }}
      />
    );
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toBeEmptyDOMElement();

    await user.click(
      screen.getByRole('button', { name: 'ai.artifacts.summary.copy' })
    );

    expect(writeText).toHaveBeenCalledWith('\u2022 one\n\u2022 two');
    expect(
      await screen.findByRole('button', { name: 'ai.artifacts.summary.copied' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent('ai.artifacts.summary.copied');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports a refused copy with an error toast and no copied state', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SummaryViewer artifact={artifact} />);

    await user.click(
      screen.getByRole('button', { name: 'ai.artifacts.summary.copy' })
    );

    expect(toast.error).toHaveBeenCalledWith('ai.artifacts.summary.copyError');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.summary.copy' })
    ).toBeInTheDocument();
  });
});
