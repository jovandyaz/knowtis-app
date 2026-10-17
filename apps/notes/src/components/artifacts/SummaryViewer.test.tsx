import { expectLinkNavigationBlocked } from '@/test/link-navigation';
import { render } from '@testing-library/react';
import { describe, it, vi } from 'vitest';

import type { SummaryArtifact } from '@knowtis/shared-types';

import { SummaryViewer } from './SummaryViewer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
  it('blocks navigation from a link in the summary', () => {
    render(<SummaryViewer artifact={artifact} />);
    expectLinkNavigationBlocked(document.body, 'plain');
  });
});
