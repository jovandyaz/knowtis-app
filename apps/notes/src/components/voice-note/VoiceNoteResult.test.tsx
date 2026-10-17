import { expectLinkNavigationBlocked } from '@/test/link-navigation';
import { render } from '@testing-library/react';
import { describe, it, vi } from 'vitest';

import { VoiceNoteResult } from './VoiceNoteResult';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('VoiceNoteResult', () => {
  it('blocks navigation from a link in the transcript', () => {
    render(
      <VoiceNoteResult
        title="Memo"
        content='<p>plain <a href="https://evil.test/?q=1">go</a></p>'
        onCreateNote={vi.fn()}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />
    );
    expectLinkNavigationBlocked(document.body, 'plain');
  });
});
