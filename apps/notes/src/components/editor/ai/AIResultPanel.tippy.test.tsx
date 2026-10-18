import { useAIStore } from '@/stores/ai.store';
import { createMockEditor } from '@/test/mock-editor';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIResultPanel } from './AIResultPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const REPLACE = 'ai.preview.replace';

describe('AIResultPanel preview popper', () => {
  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
  });

  async function showResultWithLinkDialog() {
    useAIStore.setState({
      status: 'done',
      streamedText: '[go](https://example.com/page)',
    });
    render(<AIResultPanel editor={createMockEditor()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'go' }));
    await screen.findByRole('dialog');
  }

  it('stays on screen while the user presses inside the link dialog', async () => {
    await showResultWithLinkDialog();

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'common:buttons.copyLink' })
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));

    expect(screen.getByText(REPLACE)).toBeInTheDocument();
  });

  it('stays on screen when the user presses the dialog overlay', async () => {
    await showResultWithLinkDialog();
    const overlay = document.querySelector('[data-knowtis-dialog-overlay]');
    if (!overlay) {
      throw new Error('dialog overlay not found');
    }

    fireEvent.mouseDown(overlay);

    expect(screen.getByText(REPLACE)).toBeInTheDocument();
  });

  it('hides when the user presses elsewhere on the page', async () => {
    useAIStore.setState({ status: 'done', streamedText: 'plain text' });
    render(<AIResultPanel editor={createMockEditor()} />);
    await screen.findByText(REPLACE);

    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByText(REPLACE)).toBeNull());
  });
});
