import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Streamdown } from 'streamdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkConfirmationDialog } from '../../components/LinkConfirmationDialog';
import { UNTRUSTED_MARKDOWN_PROPS } from './untrusted-markdown';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const URL_UNDER_TEST = 'https://example.com/page';
const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

function renderUntrusted(markdown: string) {
  return render(
    <Streamdown mode="static" {...UNTRUSTED_MARKDOWN_PROPS}>
      {markdown}
    </Streamdown>
  );
}

describe('UNTRUSTED_MARKDOWN_PROPS', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('links', () => {
    it('opens a dialog naming the address instead of navigating', async () => {
      renderUntrusted(`[go](${URL_UNDER_TEST})`);

      expect(screen.queryByRole('link')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'go' }));

      const dialog = await screen.findByRole('dialog', {
        name: 'notes:ai.linkConfirm.title',
      });
      expect(dialog).toHaveTextContent(URL_UNDER_TEST);
    });

    it('opens the address in a new tab, with no referrer, and closes the dialog once confirmed', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      renderUntrusted(`[go](${URL_UNDER_TEST})`);
      await userEvent.click(screen.getByRole('button', { name: 'go' }));

      await userEvent.click(
        await screen.findByRole('button', { name: 'notes:ai.linkConfirm.open' })
      );

      expect(open).toHaveBeenCalledWith(URL_UNDER_TEST, '_blank', 'noreferrer');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('copies the address to the clipboard', async () => {
      const user = userEvent.setup();
      renderUntrusted(`[go](${URL_UNDER_TEST})`);
      await user.click(screen.getByRole('button', { name: 'go' }));

      await user.click(
        await screen.findByRole('button', { name: 'common:buttons.copyLink' })
      );

      expect(await navigator.clipboard.readText()).toBe(URL_UNDER_TEST);
      expect(
        screen.getByRole('button', { name: 'common:buttons.copied' })
      ).toBeInTheDocument();
    });

    it.each([
      ['Escape', () => userEvent.keyboard('{Escape}')],
      [
        'Cancel',
        async () =>
          userEvent.click(
            await screen.findByRole('button', {
              name: 'common:buttons.cancel',
            })
          ),
      ],
    ])('returns focus to the link after %s', async (_name, dismiss) => {
      renderUntrusted(`[go](${URL_UNDER_TEST})`);
      const link = screen.getByRole('button', { name: 'go' });
      await userEvent.click(link);
      await screen.findByRole('dialog');

      await dismiss();

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(link).toHaveFocus();
    });

    it('shows the host of a very long address prominently and keeps the buttons reachable', async () => {
      const long = `https://deep.example.org/${'a'.repeat(5000)}`;
      renderUntrusted(`[go](${long})`);
      await userEvent.click(screen.getByRole('button', { name: 'go' }));

      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByText('deep.example.org')).toBeInTheDocument();
      expect(within(dialog).getByText(long)).toHaveClass(
        'max-h-32',
        'overflow-y-auto'
      );
      expect(
        within(dialog).getByRole('button', {
          name: 'notes:ai.linkConfirm.open',
        })
      ).toBeInTheDocument();
    });

    it('resolves a protocol-relative address so the real host is shown', () => {
      render(
        <LinkConfirmationDialog
          isOpen
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          url="//evil.example/x"
        />
      );

      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByText('evil.example')).toBeInTheDocument();
      expect(
        within(dialog).getByText(`${window.location.protocol}//evil.example/x`)
      ).toBeInTheDocument();
    });

    it('shows the copy confirmation only until the dialog is reopened', async () => {
      const user = userEvent.setup();
      renderUntrusted(`[go](${URL_UNDER_TEST})`);
      await user.click(screen.getByRole('button', { name: 'go' }));
      await user.click(
        await screen.findByRole('button', { name: 'common:buttons.copyLink' })
      );
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'go' }));

      expect(
        await screen.findByRole('button', { name: 'common:buttons.copyLink' })
      ).toBeInTheDocument();
    });

    it('closes the dialog without opening anything on Escape', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      renderUntrusted(`[go](${URL_UNDER_TEST})`);
      await userEvent.click(screen.getByRole('button', { name: 'go' }));
      await screen.findByRole('dialog');

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('tables', () => {
    it('renders without the fullscreen control Streamdown shows by default', () => {
      const { unmount } = render(
        <Streamdown mode="static">{TABLE}</Streamdown>
      );
      expect(screen.getByTitle('View fullscreen')).toBeInTheDocument();
      unmount();

      renderUntrusted(TABLE);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.queryByTitle('View fullscreen')).toBeNull();
    });
  });

  describe('diagrams', () => {
    it('never renders a mermaid fence as a diagram, since no mermaid plugin is passed', () => {
      const { container } = renderUntrusted('```mermaid\ngraph TD; A-->B\n```');

      expect(
        container.querySelector('[data-streamdown*="mermaid"]')
      ).toBeNull();
      expect(container).toHaveTextContent('graph TD');
    });
  });
});
